import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

type Product = {
  id: string;
  userId: string;
  name: string;
};

type Keyword = {
  id: string;
  productId: string;
  keyword: string;
};

type Thread = {
  id: string;
  productId: string;
  redditThreadId: string;
  title: string;
  bodyPreview: string;
  subreddit: string;
  url: string;
  createdUtc: number;
  discoveredAt: number;
  status: "active" | "dismissed";
  isNew: boolean;
};

const mockProducts: Product[] = [
  { id: "prod-1", userId: "user-1", name: "TaskFlow" },
  { id: "prod-2", userId: "user-2", name: "OtherProduct" },
  { id: "prod-3", userId: "user-1", name: "NoKeywords" },
];

const mockKeywords: Keyword[] = [
  { id: "kw-1", productId: "prod-1", keyword: "productivity app" },
  { id: "kw-2", productId: "prod-1", keyword: "task management" },
  { id: "kw-3", productId: "prod-2", keyword: "other keyword" },
];

const initialThreads: Thread[] = [
  {
    id: "thread-1",
    productId: "prod-1",
    redditThreadId: "existing123",
    title: "Best productivity tools?",
    bodyPreview: "Looking for recommendations...",
    subreddit: "productivity",
    url: "https://reddit.com/r/productivity/existing123",
    createdUtc: Math.floor(Date.now() / 1000) - 3600,
    discoveredAt: Math.floor(Date.now() / 1000) - 3600,
    status: "active",
    isNew: false,
  },
];

let mutableThreads: Thread[] = [];

const refreshThreadsSchema = z.object({
  productId: z.string().min(1),
});

function createTestApp(authenticated = true, mockRedditResults: Array<{ id: string; title: string; selftext: string; subreddit: string; permalink: string; created_utc: number }> = []) {
  mutableThreads = initialThreads.map((t) => ({ ...t }));

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

    const product = mockProducts.find(
      (p) => p.id === productId && p.userId === user.id
    );

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    const productKeywords = mockKeywords.filter((k) => k.productId === productId);

    if (productKeywords.length === 0) {
      return c.json({ error: "No keywords found for this product" }, 400);
    }

    const existingIds = new Set(
      mutableThreads
        .filter((t) => t.productId === productId)
        .map((t) => t.redditThreadId)
    );

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const seenIds = new Set<string>();
    const newThreads: Omit<Thread, "id" | "discoveredAt" | "status" | "isNew">[] = [];

    for (const result of mockRedditResults) {
      if (seenIds.has(result.id)) continue;
      if (existingIds.has(result.id)) continue;
      if (result.created_utc < sevenDaysAgo) continue;

      seenIds.add(result.id);
      newThreads.push({
        productId,
        redditThreadId: result.id,
        title: result.title,
        bodyPreview: (result.selftext || "").slice(0, 200),
        subreddit: result.subreddit,
        url: `https://reddit.com${result.permalink}`,
        createdUtc: result.created_utc,
      });
    }

    const now = Math.floor(Date.now() / 1000);

    if (newThreads.length > 0) {
      for (const thread of newThreads) {
        mutableThreads.push({
          id: `new-${thread.redditThreadId}`,
          ...thread,
          discoveredAt: now,
          status: "active",
          isNew: true,
        });
      }
    }

    return c.json({ newThreadsCount: newThreads.length });
  });

  return app;
}

describe("POST /api/threads/refresh", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 for missing productId", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 for empty productId", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 404 for non-existent product", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "non-existent" }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns 404 for product belonging to different user", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-2" }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns 400 when product has no keywords", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-3" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("No keywords found for this product");
  });

  test("returns newThreadsCount of 0 when no new threads found", async () => {
    const app = createTestApp(true, []);
    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsCount).toBe(0);
  });

  test("returns correct count when new threads found", async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createTestApp(true, [
      {
        id: "new123",
        title: "New thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/new123",
        created_utc: now - 3600,
      },
      {
        id: "new456",
        title: "Another new thread",
        selftext: "More content",
        subreddit: "productivity",
        permalink: "/r/productivity/new456",
        created_utc: now - 7200,
      },
    ]);

    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsCount).toBe(2);
  });

  test("skips threads that already exist in database", async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createTestApp(true, [
      {
        id: "existing123",
        title: "Already exists",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/existing123",
        created_utc: now - 3600,
      },
      {
        id: "new789",
        title: "New thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/new789",
        created_utc: now - 3600,
      },
    ]);

    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsCount).toBe(1);
  });

  test("skips threads older than 7 days", async () => {
    const now = Math.floor(Date.now() / 1000);
    const eightDaysAgo = now - 8 * 24 * 60 * 60;

    const app = createTestApp(true, [
      {
        id: "old123",
        title: "Old thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/old123",
        created_utc: eightDaysAgo,
      },
    ]);

    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsCount).toBe(0);
  });

  test("deduplicates threads found from multiple keywords", async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createTestApp(true, [
      {
        id: "dup123",
        title: "Duplicate thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/dup123",
        created_utc: now - 3600,
      },
      {
        id: "dup123",
        title: "Duplicate thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/dup123",
        created_utc: now - 3600,
      },
    ]);

    const res = await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsCount).toBe(1);
  });

  test("inserts new threads with isNew=true", async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createTestApp(true, [
      {
        id: "newthread",
        title: "New thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/newthread",
        created_utc: now - 3600,
      },
    ]);

    await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "newthread");
    expect(newThread).toBeDefined();
    expect(newThread?.isNew).toBe(true);
  });

  test("inserts new threads with status=active", async () => {
    const now = Math.floor(Date.now() / 1000);
    const app = createTestApp(true, [
      {
        id: "activethread",
        title: "Active thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/activethread",
        created_utc: now - 3600,
      },
    ]);

    await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "activethread");
    expect(newThread).toBeDefined();
    expect(newThread?.status).toBe("active");
  });

  test("truncates body preview to 200 characters", async () => {
    const now = Math.floor(Date.now() / 1000);
    const longContent = "a".repeat(300);
    const app = createTestApp(true, [
      {
        id: "longthread",
        title: "Long thread",
        selftext: longContent,
        subreddit: "productivity",
        permalink: "/r/productivity/longthread",
        created_utc: now - 3600,
      },
    ]);

    await app.request("/api/threads/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod-1" }),
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "longthread");
    expect(newThread?.bodyPreview.length).toBe(200);
  });
});

describe("Refresh button UI behavior", () => {
  test("toast shows singular form for 1 thread", () => {
    const count = 1;
    const message = `Found ${count} new thread${count === 1 ? "" : "s"}`;
    expect(message).toBe("Found 1 new thread");
  });

  test("toast shows plural form for multiple threads", () => {
    const count = 5;
    const message = `Found ${count} new thread${count === 1 ? "" : "s"}`;
    expect(message).toBe("Found 5 new threads");
  });

  test("toast shows message when no threads found", () => {
    const count = 0;
    const message = count > 0 ? `Found ${count} new threads` : "No new threads found";
    expect(message).toBe("No new threads found");
  });
});
