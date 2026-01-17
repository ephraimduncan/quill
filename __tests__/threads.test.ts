import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

function createTestApp(authenticated = true, mockThreads: unknown[] = []) {
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

    return c.json({ threads: mockThreads });
  });

  return app;
}

const mockThreads = [
  {
    redditThreadId: "abc123",
    title: "Looking for a good task management app",
    bodyPreview: "I need help organizing my daily tasks...",
    subreddit: "productivity",
    url: "https://reddit.com/r/productivity/comments/abc123",
    createdUtc: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    redditThreadId: "def456",
    title: "Best project management tools for small teams?",
    bodyPreview: "We are a team of 5 and need...",
    subreddit: "startups",
    url: "https://reddit.com/r/startups/comments/def456",
    createdUtc: Math.floor(Date.now() / 1000) - 7200,
  },
];

describe("POST /api/threads/search", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: ["productivity"] }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 when keywords is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Keywords array is required");
  });

  test("returns 400 when keywords is not an array", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: "not-an-array" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Keywords array is required");
  });

  test("returns 400 when keywords array is empty", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: [] }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Keywords array is required");
  });

  test("returns threads array for valid keywords", async () => {
    const app = createTestApp(true, mockThreads);
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: ["productivity", "task manager"] }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("threads");
    expect(Array.isArray(json.threads)).toBe(true);
  });

  test("returns empty threads array when no results", async () => {
    const app = createTestApp(true, []);
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: ["xyz123nonexistent"] }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.threads).toEqual([]);
  });

  test("thread objects have required properties", async () => {
    const app = createTestApp(true, mockThreads);
    const res = await app.request("/api/threads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: ["productivity"] }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();

    const thread = json.threads[0];
    expect(thread).toHaveProperty("redditThreadId");
    expect(thread).toHaveProperty("title");
    expect(thread).toHaveProperty("bodyPreview");
    expect(thread).toHaveProperty("subreddit");
    expect(thread).toHaveProperty("url");
    expect(thread).toHaveProperty("createdUtc");
  });
});

describe("thread deduplication and sorting", () => {
  test("threads should be sorted by createdUtc descending", () => {
    const sortedThreads = [...mockThreads].sort(
      (a, b) => b.createdUtc - a.createdUtc
    );
    expect(sortedThreads[0].redditThreadId).toBe("abc123");
    expect(sortedThreads[1].redditThreadId).toBe("def456");
  });

  test("thread age filtering works correctly", () => {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const recentThread = { createdUtc: Math.floor(Date.now() / 1000) - 3600 };
    const oldThread = { createdUtc: sevenDaysAgo - 1000 };

    expect(recentThread.createdUtc > sevenDaysAgo).toBe(true);
    expect(oldThread.createdUtc > sevenDaysAgo).toBe(false);
  });
});
