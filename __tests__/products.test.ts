import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

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

const insertedProducts: Array<{
  id: string;
  userId: string;
  url: string;
  name: string;
  description: string;
  targetAudience: string;
  createdAt: number;
}> = [];

const insertedKeywords: Array<{
  id: string;
  productId: string;
  keyword: string;
}> = [];

const insertedThreads: Array<{
  id: string;
  productId: string;
  redditThreadId: string;
  title: string;
  bodyPreview: string;
  subreddit: string;
  url: string;
  createdUtc: number;
  discoveredAt: number;
  status: string;
  isNew: boolean;
}> = [];

function createTestApp(authenticated = true) {
  insertedProducts.length = 0;
  insertedKeywords.length = 0;
  insertedThreads.length = 0;

  const app = new Hono<{ Variables: Variables }>().basePath("/api");

  app.use("*", async (c, next) => {
    if (authenticated) {
      c.set("user", mockUser);
      c.set("session", {});
    } else {
      c.set("user", null);
      c.set("session", null);
    }
    return next();
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
    const productId = `product-${Date.now()}`;
    const now = Math.floor(Date.now() / 1000);

    insertedProducts.push({
      id: productId,
      userId: user.id,
      url: data.url,
      name: data.name,
      description: data.description,
      targetAudience: data.targetAudience,
      createdAt: now,
    });

    for (const keyword of data.keywords) {
      insertedKeywords.push({
        id: `keyword-${Date.now()}-${Math.random()}`,
        productId,
        keyword,
      });
    }

    for (const thread of data.threads) {
      insertedThreads.push({
        id: `thread-${Date.now()}-${Math.random()}`,
        productId,
        redditThreadId: thread.redditThreadId,
        title: thread.title,
        bodyPreview: thread.bodyPreview,
        subreddit: thread.subreddit,
        url: thread.url,
        createdUtc: thread.createdUtc,
        discoveredAt: now,
        status: "active",
        isNew: true,
      });
    }

    return c.json({ id: productId }, 201);
  });

  return app;
}

describe("POST /api/products", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        name: "Test Product",
        description: "A test description",
        targetAudience: "Developers",
        keywords: ["test"],
        threads: [],
      }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 for invalid request data", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: "data" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when name is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        description: "A test description",
        targetAudience: "Developers",
        keywords: ["test"],
        threads: [],
      }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when URL is invalid", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "not-a-valid-url",
        name: "Test Product",
        description: "A test description",
        targetAudience: "Developers",
        keywords: ["test"],
        threads: [],
      }),
    });

    expect(res.status).toBe(400);
  });

  test("creates product and returns 201 with id", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        name: "Test Product",
        description: "A test description",
        targetAudience: "Developers",
        keywords: ["productivity", "tools"],
        threads: [
          {
            redditThreadId: "abc123",
            title: "Test Thread",
            bodyPreview: "This is a preview",
            subreddit: "test",
            url: "https://reddit.com/r/test/abc123",
            createdUtc: 1700000000,
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toHaveProperty("id");
    expect(typeof json.id).toBe("string");
  });

  test("inserts product with correct data", async () => {
    const app = createTestApp();
    await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://myproduct.com",
        name: "My Product",
        description: "Product description",
        targetAudience: "Everyone",
        keywords: [],
        threads: [],
      }),
    });

    expect(insertedProducts).toHaveLength(1);
    expect(insertedProducts[0].name).toBe("My Product");
    expect(insertedProducts[0].url).toBe("https://myproduct.com");
    expect(insertedProducts[0].userId).toBe("user-1");
  });

  test("inserts keywords for product", async () => {
    const app = createTestApp();
    await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        name: "Test",
        description: "",
        targetAudience: "",
        keywords: ["keyword1", "keyword2", "keyword3"],
        threads: [],
      }),
    });

    expect(insertedKeywords).toHaveLength(3);
    expect(insertedKeywords.map((k) => k.keyword)).toContain("keyword1");
    expect(insertedKeywords.map((k) => k.keyword)).toContain("keyword2");
    expect(insertedKeywords.map((k) => k.keyword)).toContain("keyword3");
  });

  test("inserts threads for product with isNew=true and status=active", async () => {
    const app = createTestApp();
    await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        name: "Test",
        description: "",
        targetAudience: "",
        keywords: [],
        threads: [
          {
            redditThreadId: "thread1",
            title: "Thread 1",
            bodyPreview: "Preview 1",
            subreddit: "sub1",
            url: "https://reddit.com/r/sub1/thread1",
            createdUtc: 1700000000,
          },
          {
            redditThreadId: "thread2",
            title: "Thread 2",
            bodyPreview: "Preview 2",
            subreddit: "sub2",
            url: "https://reddit.com/r/sub2/thread2",
            createdUtc: 1700000001,
          },
        ],
      }),
    });

    expect(insertedThreads).toHaveLength(2);
    expect(insertedThreads[0].isNew).toBe(true);
    expect(insertedThreads[0].status).toBe("active");
    expect(insertedThreads[1].isNew).toBe(true);
    expect(insertedThreads[1].status).toBe("active");
  });

  test("handles empty keywords and threads arrays", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        name: "Minimal Product",
        description: "",
        targetAudience: "",
        keywords: [],
        threads: [],
      }),
    });

    expect(res.status).toBe(201);
    expect(insertedProducts).toHaveLength(1);
    expect(insertedKeywords).toHaveLength(0);
    expect(insertedThreads).toHaveLength(0);
  });
});

describe("createProductSchema validation", () => {
  test("accepts valid complete data", () => {
    const result = createProductSchema.safeParse({
      url: "https://example.com",
      name: "Test Product",
      description: "A description",
      targetAudience: "Developers",
      keywords: ["test", "product"],
      threads: [
        {
          redditThreadId: "abc",
          title: "Test",
          bodyPreview: "Preview",
          subreddit: "test",
          url: "https://reddit.com",
          createdUtc: 123456,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid URL", () => {
    const result = createProductSchema.safeParse({
      url: "not-a-url",
      name: "Test",
      description: "",
      targetAudience: "",
      keywords: [],
      threads: [],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty name", () => {
    const result = createProductSchema.safeParse({
      url: "https://example.com",
      name: "",
      description: "",
      targetAudience: "",
      keywords: [],
      threads: [],
    });
    expect(result.success).toBe(false);
  });

  test("accepts empty description and targetAudience", () => {
    const result = createProductSchema.safeParse({
      url: "https://example.com",
      name: "Product",
      description: "",
      targetAudience: "",
      keywords: [],
      threads: [],
    });
    expect(result.success).toBe(true);
  });
});
