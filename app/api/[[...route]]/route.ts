import { Hono } from "hono";
import { handle } from "hono/vercel";
import { eq, count, and } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, products, threads } from "@/lib/db";

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

const productInfoSchema = z.object({
  name: z.string().describe("The product or service name"),
  description: z
    .string()
    .describe("A concise description of what the product does"),
  targetAudience: z
    .string()
    .describe("Who the product is for and what problems it solves"),
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

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
export const PATCH = handle(app);
