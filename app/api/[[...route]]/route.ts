import { randomUUID } from "crypto";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { eq, count, and } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { generateObject, generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, products, threads, keywords, account, postHistory } from "@/lib/db";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>().basePath("/api");

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
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

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
  url: z.string().url(),
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
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const productId = c.req.param("id");

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, user.id)));

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const productKeywords = await db
    .select()
    .from(keywords)
    .where(eq(keywords.productId, productId));

  const productThreads = await db
    .select()
    .from(threads)
    .where(eq(threads.productId, productId));

  return c.json({
    ...product,
    keywords: productKeywords.map((k) => k.keyword),
    threads: productThreads,
  });
});

app.get("/history/:productId", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const productId = c.req.param("productId");

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, user.id)));

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const history = await db
    .select({
      id: postHistory.id,
      threadId: postHistory.threadId,
      responseSnippet: postHistory.responseSnippet,
      redditCommentUrl: postHistory.redditCommentUrl,
      postedAt: postHistory.postedAt,
      threadTitle: threads.title,
      threadSubreddit: threads.subreddit,
      threadUrl: threads.url,
    })
    .from(postHistory)
    .innerJoin(threads, eq(postHistory.threadId, threads.id))
    .where(eq(postHistory.productId, productId))
    .orderBy(postHistory.postedAt);

  return c.json(history);
});

app.post("/products", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request data" }, 400);
  }

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
    )
    .min(1)
    .max(15)
    .describe("Search keywords optimized for Reddit search"),
});

app.post("/extract", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { url } = body;

  if (!url || typeof url !== "string") {
    return c.json({ error: "URL is required" }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return c.json({ error: "Invalid URL format" }, 400);
  }

  let html: string;
  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RedditAgent/1.0; +https://reddit-agent.app)",
      },
    });
    if (!response.ok) {
      return c.json({ error: `Failed to fetch URL: ${response.status}` }, 400);
    }
    html = await response.text();
  } catch (err) {
    return c.json(
      { error: `Failed to fetch URL: ${err instanceof Error ? err.message : "Unknown error"}` },
      400
    );
  }

  const dom = new JSDOM(html, { url: parsedUrl.toString() });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article || !article.textContent?.trim()) {
    return c.json({ error: "Could not extract content from URL" }, 400);
  }

  const contentForLLM = `
Title: ${article.title || "Unknown"}
Site: ${article.siteName || parsedUrl.hostname}
Content:
${article.textContent.slice(0, 8000)}
`.trim();

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: productInfoSchema,
      prompt: `Extract product information from this webpage content. If any field cannot be determined, make a reasonable inference based on the available content.

${contentForLLM}`,
    });

    return c.json({
      name: object.name,
      description: object.description,
      targetAudience: object.targetAudience,
      url: parsedUrl.toString(),
    });
  } catch (err) {
    return c.json(
      { error: `Failed to extract product info: ${err instanceof Error ? err.message : "Unknown error"}` },
      500
    );
  }
});

app.post("/keywords/generate", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { name, description, targetAudience } = body;

  if (!name || typeof name !== "string") {
    return c.json({ error: "Product name is required" }, 400);
  }

  const productContext = `
Product: ${name}
${description ? `Description: ${description}` : ""}
${targetAudience ? `Target Audience: ${targetAudience}` : ""}
`.trim();

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: keywordsSchema,
      prompt: `Generate 10 search keywords to find Reddit discussions where users are looking for solutions that this product could help with.

${productContext}

Requirements:
- Keywords should match how people naturally describe their problems on Reddit
- Include problem-focused phrases (e.g., "how to fix", "best way to", "help with")
- Include product category terms and alternatives people might search for
- Avoid brand names or overly specific product features
- Each keyword should be 2-5 words for optimal Reddit search results
- Focus on pain points and use cases rather than solutions`,
    });

    return c.json({ keywords: object.keywords });
  } catch (err) {
    return c.json(
      { error: `Failed to generate keywords: ${err instanceof Error ? err.message : "Unknown error"}` },
      500
    );
  }
});

type RedditThread = {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
};

app.post("/threads/search", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { keywords } = body;

  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return c.json({ error: "Keywords array is required" }, 400);
  }

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const seenIds = new Set<string>();
  const allThreads: Array<{
    redditThreadId: string;
    title: string;
    bodyPreview: string;
    subreddit: string;
    url: string;
    createdUtc: number;
  }> = [];

  for (const keyword of keywords) {
    if (typeof keyword !== "string" || !keyword.trim()) continue;

    try {
      const searchUrl = new URL("https://www.reddit.com/search.json");
      searchUrl.searchParams.set("q", keyword);
      searchUrl.searchParams.set("sort", "new");
      searchUrl.searchParams.set("limit", "10");
      searchUrl.searchParams.set("t", "week");
      searchUrl.searchParams.set("type", "link");

      const response = await fetch(searchUrl.toString(), {
        headers: {
          "User-Agent": "RedditAgent/1.0",
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const posts = data?.data?.children || [];

      for (const post of posts) {
        const thread = post.data as RedditThread;
        if (seenIds.has(thread.id)) continue;
        if (thread.created_utc < sevenDaysAgo) continue;

        seenIds.add(thread.id);
        allThreads.push({
          redditThreadId: thread.id,
          title: thread.title,
          bodyPreview: (thread.selftext || "").slice(0, 200),
          subreddit: thread.subreddit,
          url: `https://reddit.com${thread.permalink}`,
          createdUtc: thread.created_utc,
        });
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
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const threadId = c.req.param("id");

  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) {
    return c.json({ error: "Thread not found" }, 404);
  }

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, thread.productId), eq(products.userId, user.id)));
  if (!product) {
    return c.json({ error: "Thread not found" }, 404);
  }

  await db.update(threads).set({ isNew: false }).where(eq(threads.id, threadId));

  return c.json({ success: true });
});

app.post("/threads/:id/dismiss", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const threadId = c.req.param("id");

  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) {
    return c.json({ error: "Thread not found" }, 404);
  }

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, thread.productId), eq(products.userId, user.id)));
  if (!product) {
    return c.json({ error: "Thread not found" }, 404);
  }

  await db.update(threads).set({ status: "dismissed" }).where(eq(threads.id, threadId));

  return c.json({ success: true });
});

app.post("/threads/:id/restore", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const threadId = c.req.param("id");

  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId));
  if (!thread) {
    return c.json({ error: "Thread not found" }, 404);
  }

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, thread.productId), eq(products.userId, user.id)));
  if (!product) {
    return c.json({ error: "Thread not found" }, 404);
  }

  await db.update(threads).set({ status: "active" }).where(eq(threads.id, threadId));

  return c.json({ success: true });
});

const refreshThreadsSchema = z.object({
  productId: z.string().min(1),
});

app.post("/threads/refresh", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = refreshThreadsSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request data" }, 400);
  }

  const { productId } = parsed.data;

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, user.id)));

  if (!product) {
    return c.json({ error: "Product not found" }, 404);
  }

  const productKeywords = await db
    .select()
    .from(keywords)
    .where(eq(keywords.productId, productId));

  if (productKeywords.length === 0) {
    return c.json({ error: "No keywords found for this product" }, 400);
  }

  const existingThreads = await db
    .select({ redditThreadId: threads.redditThreadId })
    .from(threads)
    .where(eq(threads.productId, productId));

  const existingIds = new Set(existingThreads.map((t) => t.redditThreadId));

  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const seenIds = new Set<string>();
  const newThreads: Array<{
    redditThreadId: string;
    title: string;
    bodyPreview: string;
    subreddit: string;
    url: string;
    createdUtc: number;
  }> = [];

  for (const kw of productKeywords) {
    try {
      const searchUrl = new URL("https://www.reddit.com/search.json");
      searchUrl.searchParams.set("q", kw.keyword);
      searchUrl.searchParams.set("sort", "new");
      searchUrl.searchParams.set("limit", "10");
      searchUrl.searchParams.set("t", "week");
      searchUrl.searchParams.set("type", "link");

      const response = await fetch(searchUrl.toString(), {
        headers: { "User-Agent": "RedditAgent/1.0" },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const posts = data?.data?.children || [];

      for (const post of posts) {
        const thread = post.data as RedditThread;
        if (seenIds.has(thread.id)) continue;
        if (existingIds.has(thread.id)) continue;
        if (thread.created_utc < sevenDaysAgo) continue;

        seenIds.add(thread.id);
        newThreads.push({
          redditThreadId: thread.id,
          title: thread.title,
          bodyPreview: (thread.selftext || "").slice(0, 200),
          subreddit: thread.subreddit,
          url: `https://reddit.com${thread.permalink}`,
          createdUtc: thread.created_utc,
        });
      }
    } catch {
      continue;
    }
  }

  const now = Math.floor(Date.now() / 1000);

  if (newThreads.length > 0) {
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
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = generateResponseSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request data" }, 400);
  }

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
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      prompt,
      temperature: 0.7,
    });

    return c.json({ response: text });
  } catch (err) {
    return c.json(
      { error: `Failed to generate response: ${err instanceof Error ? err.message : "Unknown error"}` },
      500
    );
  }
});

const postResponseSchema = z.object({
  threadId: z.string().min(1),
  redditThreadId: z.string().min(1),
  productId: z.string().min(1),
  response: z.string().min(1),
});

app.post("/response/post", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const parsed = postResponseSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request data" }, 400);
  }

  const { threadId, redditThreadId, productId, response } = parsed.data;

  const [userAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, user.id), eq(account.providerId, "reddit")));

  if (!userAccount || !userAccount.accessToken) {
    return c.json({ error: "Reddit account not connected" }, 401);
  }

  const formData = new URLSearchParams();
  formData.append("api_type", "json");
  formData.append("thing_id", `t3_${redditThreadId}`);
  formData.append("text", response);

  try {
    const redditResponse = await fetch(
      "https://oauth.reddit.com/api/comment",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userAccount.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "RedditAgent/1.0",
        },
        body: formData.toString(),
      }
    );

    const data = await redditResponse.json();

    if (data.json?.errors?.length > 0) {
      const [errorCode, errorMessage] = data.json.errors[0];
      return c.json({ error: errorMessage || errorCode }, 400);
    }

    const commentData = data.json?.data?.things?.[0]?.data;
    const commentUrl = commentData?.permalink
      ? `https://reddit.com${commentData.permalink}`
      : null;

    await db.insert(postHistory).values({
      id: randomUUID(),
      userId: user.id,
      productId,
      threadId,
      responseSnippet: response.slice(0, 100),
      redditCommentUrl: commentUrl || "",
      postedAt: Math.floor(Date.now() / 1000),
    });

    return c.json({ success: true, commentUrl });
  } catch (err) {
    return c.json(
      {
        error: `Failed to post to Reddit: ${err instanceof Error ? err.message : "Unknown error"}`,
      },
      500
    );
  }
});

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
