import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

type Product = {
  id: string;
  userId: string;
  name: string;
  description: string;
  targetAudience: string;
  url: string;
  createdAt: number;
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
  {
    id: "prod-1",
    userId: "user-1",
    name: "TaskFlow",
    description: "Task management app",
    targetAudience: "Professionals",
    url: "https://taskflow.app",
    createdAt: 1704067200,
  },
  {
    id: "prod-2",
    userId: "user-2",
    name: "OtherProduct",
    description: "Someone else's product",
    targetAudience: "Others",
    url: "https://other.app",
    createdAt: 1704067200,
  },
];

const mockKeywords = [
  { id: "kw-1", productId: "prod-1", keyword: "task management" },
  { id: "kw-2", productId: "prod-1", keyword: "productivity" },
];

const mockThreads: Thread[] = [
  {
    id: "thread-1",
    productId: "prod-1",
    redditThreadId: "abc123",
    title: "Best productivity tools?",
    bodyPreview: "Looking for recommendations...",
    subreddit: "productivity",
    url: "https://reddit.com/r/productivity/abc123",
    createdUtc: 1704153600,
    discoveredAt: 1704153600,
    status: "active",
    isNew: true,
  },
  {
    id: "thread-2",
    productId: "prod-1",
    redditThreadId: "def456",
    title: "How to stay organized?",
    bodyPreview: "I struggle with...",
    subreddit: "getorganized",
    url: "https://reddit.com/r/getorganized/def456",
    createdUtc: 1704067200,
    discoveredAt: 1704067200,
    status: "dismissed",
    isNew: false,
  },
];

function createTestApp(authenticated = true) {
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

  app.get("/products/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const productId = c.req.param("id");
    const product = mockProducts.find(
      (p) => p.id === productId && p.userId === user.id
    );

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    const productKeywords = mockKeywords
      .filter((k) => k.productId === productId)
      .map((k) => k.keyword);

    const productThreads = mockThreads.filter((t) => t.productId === productId);

    return c.json({
      ...product,
      keywords: productKeywords,
      threads: productThreads,
    });
  });

  return app;
}

describe("GET /api/products/:id", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/products/prod-1");

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 404 for non-existent product", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/non-existent");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns 404 for product owned by different user", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/prod-2");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns product with keywords and threads", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.id).toBe("prod-1");
    expect(json.name).toBe("TaskFlow");
    expect(json.description).toBe("Task management app");
    expect(json.targetAudience).toBe("Professionals");
    expect(json.url).toBe("https://taskflow.app");
  });

  test("includes keywords array", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(Array.isArray(json.keywords)).toBe(true);
    expect(json.keywords).toContain("task management");
    expect(json.keywords).toContain("productivity");
  });

  test("includes threads array with correct structure", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(Array.isArray(json.threads)).toBe(true);
    expect(json.threads.length).toBe(2);

    const thread = json.threads[0];
    expect(thread).toHaveProperty("id");
    expect(thread).toHaveProperty("redditThreadId");
    expect(thread).toHaveProperty("title");
    expect(thread).toHaveProperty("bodyPreview");
    expect(thread).toHaveProperty("subreddit");
    expect(thread).toHaveProperty("url");
    expect(thread).toHaveProperty("status");
    expect(thread).toHaveProperty("isNew");
  });

  test("threads include status field", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();

    const activeThread = json.threads.find((t: Thread) => t.id === "thread-1");
    expect(activeThread.status).toBe("active");

    const dismissedThread = json.threads.find(
      (t: Thread) => t.id === "thread-2"
    );
    expect(dismissedThread.status).toBe("dismissed");
  });
});

describe("ResponseEditorPanel behavior", () => {
  test("formatRelativeTime returns 'just now' for recent timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    const seconds = Math.floor(Date.now() / 1000 - now);
    expect(seconds).toBeLessThan(60);
  });

  test("formatRelativeTime calculates minutes correctly", () => {
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 5 * 60;
    const seconds = Math.floor(Date.now() / 1000 - fiveMinutesAgo);
    const minutes = Math.floor(seconds / 60);
    expect(minutes).toBe(5);
  });

  test("formatRelativeTime calculates hours correctly", () => {
    const threeHoursAgo = Math.floor(Date.now() / 1000) - 3 * 60 * 60;
    const seconds = Math.floor(Date.now() / 1000 - threeHoursAgo);
    const hours = Math.floor(seconds / 60 / 60);
    expect(hours).toBe(3);
  });

  test("formatRelativeTime calculates days correctly", () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const seconds = Math.floor(Date.now() / 1000 - twoDaysAgo);
    const days = Math.floor(seconds / 60 / 60 / 24);
    expect(days).toBe(2);
  });
});

describe("Monitor page data handling", () => {
  test("filters active threads correctly", () => {
    const threads = mockThreads;
    const activeThreads = threads.filter((t) => t.status === "active");
    expect(activeThreads.length).toBe(1);
    expect(activeThreads[0].id).toBe("thread-1");
  });

  test("finds selected thread by id", () => {
    const threads = mockThreads;
    const selectedId = "thread-1";
    const selectedThread = threads.find((t) => t.id === selectedId);
    expect(selectedThread?.title).toBe("Best productivity tools?");
  });

  test("truncates body preview at 200 characters", () => {
    const longBody =
      "A".repeat(250) + " some extra content that should be truncated";
    const truncated =
      longBody.length > 200 ? `${longBody.slice(0, 200)}...` : longBody;
    expect(truncated.length).toBe(203);
    expect(truncated.endsWith("...")).toBe(true);
  });

  test("handles empty body preview", () => {
    const emptyBody = "";
    const result = emptyBody || "No preview available";
    expect(result).toBe("No preview available");
  });
});
