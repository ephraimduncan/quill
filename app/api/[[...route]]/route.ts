import { randomUUID } from "crypto";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { eq, count, and } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { generateText, Output } from "ai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, products, threads, keywords, redditSyncState } from "@/lib/db";
import { fetchLatestPostId, batchFetchPosts, generateIdRange, base36ToNumber } from "@/lib/reddit/id-fetcher";
import { buildMatcher, type KeywordMatch } from "@/lib/reddit/keyword-matcher";
import { extractModel, keywordsModel, responseModel } from "@/lib/models";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>().basePath("/api");

async function findUserProduct(userId: string, productId: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)));
  return product ?? null;
}

async function findThreadWithOwnership(userId: string, threadId: string) {
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) return null;
  const product = await findUserProduct(userId, thread.productId);
  if (!product) return null;
  return thread;
}

function formatError(prefix: string, err: unknown): string {
  return `${prefix}: ${err instanceof Error ? err.message : "Unknown error"}`;
}

type RedditThread = {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
};

type ThreadResult = {
  redditThreadId: string;
  title: string;
  bodyPreview: string;
  subreddit: string;
  url: string;
  createdUtc: number;
};

function redditThreadToResult(thread: RedditThread): ThreadResult {
  return {
    redditThreadId: thread.id,
    title: thread.title,
    bodyPreview: (thread.selftext || "").slice(0, 200),
    subreddit: thread.subreddit,
    url: `https://reddit.com${thread.permalink}`,
    createdUtc: thread.created_utc,
  };
}

const normalizeUrlInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

const httpUrlSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    return normalizeUrlInput(value);
  },
  z
    .string()
    .url()
    .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
      message: "URL must start with http:// or https://",
    })
);

app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }
  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.get("/products", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const userProducts = await db
    .select({
      id: products.id,
      name: products.name,
      url: products.url,
      createdAt: products.createdAt,
      newThreadCount: count(threads.id),
    })
    .from(products)
    .leftJoin(
      threads,
      and(
        eq(products.id, threads.productId),
        eq(threads.isNew, true),
        eq(threads.status, "active")
      )
    )
    .where(eq(products.userId, user.id))
    .groupBy(products.id);

  return c.json(userProducts);
});

const createProductSchema = z.object({
  url: httpUrlSchema,
  name: z.string().min(1),
  description: z.string(),
  targetAudience: z.string(),
  keywords: z.array(z.string().min(1)),
  threads: z.array(
    z.object({
      redditThreadId: z.string(),
      title: z.string(),
      bodyPreview: z.string(),
      subreddit: z.string(),
      url: z.string(),
      createdUtc: z.number(),
    })
  ),
});

app.get("/products/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const productId = c.req.param("id");
  const product = await findUserProduct(user.id, productId);
  if (!product) return c.json({ error: "Product not found" }, 404);

  const [productKeywords, productThreads] = await Promise.all([
    db.select().from(keywords).where(eq(keywords.productId, productId)),
    db.select().from(threads).where(eq(threads.productId, productId)),
  ]);

  return c.json({
    ...product,
    keywords: productKeywords.map((k) => k.keyword),
    threads: productThreads,
  });
});

app.post("/products", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request data" }, 400);

  const data = parsed.data;
  const productId = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(products).values({
    id: productId,
    userId: user.id,
    url: data.url,
    name: data.name,
    description: data.description,
    targetAudience: data.targetAudience,
    createdAt: now,
  });

  if (data.keywords.length > 0) {
    await db.insert(keywords).values(
      data.keywords.map((keyword) => ({
        id: randomUUID(),
        productId,
        keyword,
      }))
    );
  }

  if (data.threads.length > 0) {
    await db.insert(threads).values(
      data.threads.map((thread) => ({
        id: randomUUID(),
        productId,
        redditThreadId: thread.redditThreadId,
        title: thread.title,
        bodyPreview: thread.bodyPreview,
        subreddit: thread.subreddit,
        url: thread.url,
        createdUtc: thread.createdUtc,
        discoveredAt: now,
        status: "active" as const,
        isNew: true,
      }))
    );
  }

  return c.json({ id: productId }, 201);
});

const updateProductSchema = z.object({
  url: httpUrlSchema,
  name: z.string().min(1),
  description: z.string(),
  targetAudience: z.string(),
  keywords: z.array(z.string().min(1)),
});

app.put("/products/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const productId = c.req.param("id");
  const existing = await findUserProduct(user.id, productId);
  if (!existing) return c.json({ error: "Product not found" }, 404);

  const body = await c.req.json();
  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request data" }, 400);

  const data = parsed.data;

  await db
    .update(products)
    .set({
      url: data.url,
      name: data.name,
      description: data.description,
      targetAudience: data.targetAudience,
    })
    .where(eq(products.id, productId));

  await db.delete(keywords).where(eq(keywords.productId, productId));

  if (data.keywords.length > 0) {
    await db.insert(keywords).values(
      data.keywords.map((keyword) => ({
        id: randomUUID(),
        productId,
        keyword,
      }))
    );
  }

  return c.json({ id: productId });
});

const productInfoSchema = z.object({
  name: z.string().describe("The product or service name"),
  description: z
    .string()
    .describe("A concise description of what the product does"),
  targetAudience: z
    .string()
    .describe("Who the product is for and what problems it solves"),
});

const keywordsSchema = z.object({
  keywords: z
    .array(
      z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-zA-Z0-9\s-]+$/)
        .refine(
          (value) => {
            const words = value.trim().split(/\s+/).filter(Boolean);
            return words.length >= 2 && words.length <= 3;
          },
          { message: "Keyword must be 2-3 words" }
        )
    )
    .min(1)
    .max(15)
    .describe("Short, specific 2-3 word keywords for Reddit search"),
});

const normalizeKeyword = (value: string) => value.replace(/\s+/g, " ").trim();
const splitWords = (value: string) => normalizeKeyword(value).split(/\s+/).filter(Boolean);
const ensureTwoWordMix = (keywords: string[]) => {
  const unique = Array.from(new Set(keywords.map(normalizeKeyword).filter(Boolean)));
  let twoWordCount = unique.filter((keyword) => splitWords(keyword).length === 2).length;
  if (twoWordCount >= 4) return unique.slice(0, 15);

  const adjusted = [...unique];
  for (let i = 0; i < adjusted.length && twoWordCount < 4; i += 1) {
    const words = splitWords(adjusted[i]);
    if (words.length === 3) {
      const candidate = words.slice(0, 2).join(" ");
      if (candidate && !adjusted.includes(candidate)) {
        adjusted[i] = candidate;
        twoWordCount += 1;
      }
    }
  }

  return Array.from(new Set(adjusted)).slice(0, 15);
};
const toExactPhraseQuery = (value: string) => {
  const normalized = normalizeKeyword(value).replace(/"/g, "");
  return normalized ? `"${normalized}"` : "";
};

async function searchRedditForKeyword(keyword: string): Promise<RedditThread[]> {
  const phraseQuery = toExactPhraseQuery(keyword);
  if (!phraseQuery) return [];

  const searchUrl = new URL("https://www.reddit.com/search.json");
  searchUrl.searchParams.set("q", phraseQuery);
  searchUrl.searchParams.set("sort", "new");
  searchUrl.searchParams.set("limit", "10");
  searchUrl.searchParams.set("t", "week");
  searchUrl.searchParams.set("type", "link");

  const response = await fetch(searchUrl.toString(), {
    headers: { "User-Agent": "RedditAgent/1.0" },
  });

  if (!response.ok) return [];
  const data = await response.json();
  return (data?.data?.children ?? []).map((p: { data: RedditThread }) => p.data);
}

app.post("/extract", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { url } = body;
  if (!url || typeof url !== "string") return c.json({ error: "URL is required" }, 400);

  const normalizedUrl = normalizeUrlInput(url);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    return c.json({ error: "Invalid URL format" }, 400);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return c.json({ error: "Invalid URL format" }, 400);
  }

  let html: string;
  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RedditAgent/1.0; +https://reddit-agent.app)" },
    });
    if (!response.ok) return c.json({ error: `Failed to fetch URL: ${response.status}` }, 400);
    html = await response.text();
  } catch (err) {
    return c.json({ error: formatError("Failed to fetch URL", err) }, 400);
  }

  const dom = new JSDOM(html, { url: parsedUrl.toString() });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent?.trim()) {
    return c.json({ error: "Could not extract content from URL" }, 400);
  }

  const pageText = article.textContent.replace(/\s+/g, " ").trim();
  const pageContext = `Title: ${article.title || "Unknown"}
Site: ${article.siteName || parsedUrl.hostname}
Content:
${pageText.slice(0, 8000)}`.trim();

  try {
    const { output } = await generateText({
      model: extractModel,
      output: Output.object({ schema: productInfoSchema }),
      prompt: `Extract product information from this webpage content. If any field cannot be determined, make a reasonable inference based on the available content.

${pageContext}`,
    });

    return c.json({
      name: output!.name,
      description: output!.description,
      targetAudience: output!.targetAudience,
      url: parsedUrl.toString(),
      pageContext,
    });
  } catch (err) {
    return c.json({ error: formatError("Failed to extract product info", err) }, 500);
  }
});

app.post("/keywords/generate", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { name, description, targetAudience, pageContext } = body;
  if (!name || typeof name !== "string") return c.json({ error: "Product name is required" }, 400);

  const trimmedPageContext = typeof pageContext === "string" ? pageContext.trim().slice(0, 6000) : "";
  const productContext = [
    `Product: ${name}`,
    description && `Description: ${description}`,
    targetAudience && `Target Audience: ${targetAudience}`,
    trimmedPageContext && `Page Content (verbatim):\n${trimmedPageContext}`,
  ].filter(Boolean).join("\n");

  try {
    const { output } = await generateText({
      model: keywordsModel,
      output: Output.object({ schema: keywordsSchema }),
      prompt: `Generate 10 short, specific keywords to find Reddit discussions where users are describing needs this product could help with.

${productContext}

Requirements:
- Use exact words from the page content when possible
- Use noun phrases (product category, audience, problem noun)
- Avoid question phrases like "how to", "best way", "help with"
- Avoid filler words and marketing language
- Avoid brand names or overly specific product features
- Prefer 2-word phrases; use 3 words only when needed for clarity (at least half should be 2 words)
- No punctuation except hyphens`,
      temperature: 0.2,
    });

    const balancedKeywords = ensureTwoWordMix(output!.keywords.map(normalizeKeyword));
    return c.json({ keywords: balancedKeywords });
  } catch (err) {
    return c.json({ error: formatError("Failed to generate keywords", err) }, 500);
  }
});

app.post("/threads/search", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { keywords } = body;
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return c.json({ error: "Keywords array is required" }, 400);
  }

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const seenIds = new Set<string>();
  const allThreads: ThreadResult[] = [];

  for (const keyword of keywords) {
    if (typeof keyword !== "string" || !keyword.trim()) continue;
    try {
      const posts = await searchRedditForKeyword(keyword);
      for (const thread of posts) {
        if (seenIds.has(thread.id) || thread.created_utc < sevenDaysAgo) continue;
        seenIds.add(thread.id);
        allThreads.push(redditThreadToResult(thread));
      }
    } catch {
      continue;
    }
  }

  allThreads.sort((a, b) => b.createdUtc - a.createdUtc);
  return c.json({ threads: allThreads });
});

app.post("/threads/:id/mark-read", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const thread = await findThreadWithOwnership(user.id, c.req.param("id"));
  if (!thread) return c.json({ error: "Thread not found" }, 404);

  await db.update(threads).set({ isNew: false }).where(eq(threads.id, thread.id));
  return c.json({ success: true });
});

app.post("/threads/:id/dismiss", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const thread = await findThreadWithOwnership(user.id, c.req.param("id"));
  if (!thread) return c.json({ error: "Thread not found" }, 404);

  await db.update(threads).set({ status: "dismissed" }).where(eq(threads.id, thread.id));
  return c.json({ success: true });
});

app.post("/threads/:id/restore", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const thread = await findThreadWithOwnership(user.id, c.req.param("id"));
  if (!thread) return c.json({ error: "Thread not found" }, 404);

  await db.update(threads).set({ status: "active" }).where(eq(threads.id, thread.id));
  return c.json({ success: true });
});

const refreshThreadsSchema = z.object({
  productId: z.string().min(1),
});

app.post("/threads/refresh", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const parsed = refreshThreadsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request data" }, 400);

  const { productId } = parsed.data;
  const product = await findUserProduct(user.id, productId);
  if (!product) return c.json({ error: "Product not found" }, 404);

  const productKeywords = await db.select().from(keywords).where(eq(keywords.productId, productId));
  if (productKeywords.length === 0) return c.json({ error: "No keywords found for this product" }, 400);

  const existingThreads = await db
    .select({ redditThreadId: threads.redditThreadId })
    .from(threads)
    .where(eq(threads.productId, productId));
  const existingIds = new Set(existingThreads.map((t) => t.redditThreadId));

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const seenIds = new Set<string>();
  const newThreads: ThreadResult[] = [];

  for (const kw of productKeywords) {
    try {
      const posts = await searchRedditForKeyword(kw.keyword);
      for (const thread of posts) {
        if (seenIds.has(thread.id) || existingIds.has(thread.id) || thread.created_utc < sevenDaysAgo) continue;
        seenIds.add(thread.id);
        newThreads.push(redditThreadToResult(thread));
      }
    } catch {
      continue;
    }
  }

  if (newThreads.length > 0) {
    const now = Math.floor(Date.now() / 1000);
    await db.insert(threads).values(
      newThreads.map((thread) => ({
        id: randomUUID(),
        productId,
        redditThreadId: thread.redditThreadId,
        title: thread.title,
        bodyPreview: thread.bodyPreview,
        subreddit: thread.subreddit,
        url: thread.url,
        createdUtc: thread.createdUtc,
        discoveredAt: now,
        status: "active" as const,
        isNew: true,
      }))
    );
  }

  return c.json({ newThreadsCount: newThreads.length });
});

const generateResponseSchema = z.object({
  thread: z.object({
    title: z.string().min(1),
    body: z.string(),
    subreddit: z.string().min(1),
  }),
  product: z.object({
    name: z.string().min(1),
    description: z.string(),
    targetAudience: z.string(),
  }),
});

app.post("/response/generate", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const parsed = generateResponseSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request data" }, 400);

  const { thread, product } = parsed.data;

  const prompt = `You are helping a product maker engage authentically on Reddit. Write a helpful response to this Reddit post that naturally recommends their product as a solution.

REDDIT POST:
Subreddit: r/${thread.subreddit}
Title: ${thread.title}
${thread.body ? `Content: ${thread.body}` : ""}

PRODUCT TO RECOMMEND:
Name: ${product.name}
${product.description ? `Description: ${product.description}` : ""}
${product.targetAudience ? `Target Audience: ${product.targetAudience}` : ""}

GUIDELINES:
- Write approximately 200 words (this is a soft limit)
- Be genuinely helpful first - address the user's question or problem
- Naturally mention the product as one solution, not as a hard sell
- Match the tone and style typical of the subreddit
- Do not include any disclosure like "I'm affiliated with" or "I work for"
- Do not use marketing speak or excessive enthusiasm
- Be conversational and authentic, like a helpful community member
- If relevant, share a brief personal experience or use case

Write only the response text, nothing else.`;

  try {
    const { text } = await generateText({ model: responseModel, prompt, temperature: 0.7 });
    return c.json({ response: text });
  } catch (err) {
    return c.json({ error: formatError("Failed to generate response", err) }, 500);
  }
});

app.get("/cron/discover", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const latestPostId = await fetchLatestPostId();
  if (!latestPostId) {
    return c.json({ error: "Failed to fetch latest Reddit post ID" }, 500);
  }

  const [syncState] = await db.select().from(redditSyncState).where(eq(redditSyncState.id, "global"));
  const lastPostId = syncState?.lastPostId;

  if (!lastPostId) {
    const now = Math.floor(Date.now() / 1000);
    await db.insert(redditSyncState).values({
      id: "global",
      lastPostId: latestPostId,
      updatedAt: now,
    });
    return c.json({
      success: true,
      message: "Initialized sync state with latest post ID",
      lastPostId: latestPostId,
      postsProcessed: 0,
      newThreadsFound: 0,
    });
  }

  if (base36ToNumber(latestPostId) <= base36ToNumber(lastPostId)) {
    return c.json({
      success: true,
      message: "No new posts since last sync",
      postsProcessed: 0,
      newThreadsFound: 0,
    });
  }

  const allKeywords = await db
    .select({ keyword: keywords.keyword, productId: keywords.productId })
    .from(keywords);

  if (allKeywords.length === 0) {
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(redditSyncState)
      .set({ lastPostId: latestPostId, updatedAt: now })
      .where(eq(redditSyncState.id, "global"));
    return c.json({
      success: true,
      message: "No keywords configured",
      postsProcessed: 0,
      newThreadsFound: 0,
    });
  }

  const keywordEntries: KeywordMatch[] = allKeywords.map((k) => ({
    keyword: k.keyword,
    productId: k.productId,
  }));
  const matcher = buildMatcher(keywordEntries);

  const idsToFetch = generateIdRange(lastPostId, latestPostId, 100);
  const posts = await batchFetchPosts(idsToFetch);

  const existingThreads = await db
    .select({ redditThreadId: threads.redditThreadId, productId: threads.productId })
    .from(threads);
  const existingSet = new Set(existingThreads.map((t) => `${t.productId}:${t.redditThreadId}`));

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  const threadsToInsert: Array<{
    id: string;
    productId: string;
    redditThreadId: string;
    title: string;
    bodyPreview: string;
    subreddit: string;
    url: string;
    createdUtc: number;
    discoveredAt: number;
    status: "active";
    isNew: true;
    matchedKeyword: string;
  }> = [];

  for (const post of posts) {
    if (post.created_utc < sevenDaysAgo) continue;

    const textToMatch = `${post.title} ${post.selftext}`;
    const matches = matcher.match(textToMatch);

    for (const match of matches) {
      const key = `${match.productId}:${post.id}`;
      if (existingSet.has(key)) continue;
      existingSet.add(key);

      threadsToInsert.push({
        id: randomUUID(),
        productId: match.productId,
        redditThreadId: post.id,
        title: post.title,
        bodyPreview: post.selftext.slice(0, 200),
        subreddit: post.subreddit,
        url: `https://reddit.com${post.permalink}`,
        createdUtc: post.created_utc,
        discoveredAt: now,
        status: "active",
        isNew: true,
        matchedKeyword: match.keyword,
      });
    }
  }

  if (threadsToInsert.length > 0) {
    await db.insert(threads).values(threadsToInsert);
  }

  await db
    .update(redditSyncState)
    .set({ lastPostId: latestPostId, updatedAt: now })
    .where(eq(redditSyncState.id, "global"));

  return c.json({
    success: true,
    postsProcessed: posts.length,
    newThreadsFound: threadsToInsert.length,
  });
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
