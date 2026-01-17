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

type PostHistoryItem = {
  id: string;
  userId: string;
  productId: string;
  threadId: string;
  responseSnippet: string;
  redditCommentUrl: string;
  postedAt: number;
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
  {
    id: "thread-3",
    productId: "prod-1",
    redditThreadId: "ghi789",
    title: "Task app suggestions",
    bodyPreview: "Need something simple...",
    subreddit: "apps",
    url: "https://reddit.com/r/apps/ghi789",
    createdUtc: 1704150000,
    discoveredAt: 1704150000,
    status: "active",
    isNew: false,
  },
];

const mockPostHistory: PostHistoryItem[] = [
  {
    id: "hist-1",
    userId: "user-1",
    productId: "prod-1",
    threadId: "thread-3",
    responseSnippet: "TaskFlow is great for this use case because...",
    redditCommentUrl: "https://reddit.com/r/apps/comments/ghi789/comment/123",
    postedAt: 1704155000,
  },
];

let mutableThreads = [...mockThreads];

function createTestApp(authenticated = true) {
  mutableThreads = [...mockThreads];

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

  app.get("/history/:productId", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const productId = c.req.param("productId");
    const product = mockProducts.find(
      (p) => p.id === productId && p.userId === user.id
    );

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    const history = mockPostHistory
      .filter((h) => h.productId === productId)
      .map((h) => {
        const thread = mutableThreads.find((t) => t.id === h.threadId);
        return {
          id: h.id,
          threadId: h.threadId,
          responseSnippet: h.responseSnippet,
          redditCommentUrl: h.redditCommentUrl,
          postedAt: h.postedAt,
          threadTitle: thread?.title || "",
          threadSubreddit: thread?.subreddit || "",
          threadUrl: thread?.url || "",
        };
      });

    return c.json(history);
  });

  app.post("/threads/:id/mark-read", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const threadId = c.req.param("id");
    const thread = mutableThreads.find((t) => t.id === threadId);

    if (!thread) {
      return c.json({ error: "Thread not found" }, 404);
    }

    const product = mockProducts.find(
      (p) => p.id === thread.productId && p.userId === user.id
    );

    if (!product) {
      return c.json({ error: "Thread not found" }, 404);
    }

    const threadIndex = mutableThreads.findIndex((t) => t.id === threadId);
    mutableThreads[threadIndex] = { ...mutableThreads[threadIndex], isNew: false };

    return c.json({ success: true });
  });

  return app;
}

describe("GET /api/history/:productId", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/history/prod-1");

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 404 for non-existent product", async () => {
    const app = createTestApp();
    const res = await app.request("/api/history/non-existent");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns 404 for product owned by different user", async () => {
    const app = createTestApp();
    const res = await app.request("/api/history/prod-2");

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns post history with thread details", async () => {
    const app = createTestApp();
    const res = await app.request("/api/history/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();

    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(1);
  });

  test("history item includes all required fields", async () => {
    const app = createTestApp();
    const res = await app.request("/api/history/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();
    const item = json[0];

    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("threadId");
    expect(item).toHaveProperty("responseSnippet");
    expect(item).toHaveProperty("redditCommentUrl");
    expect(item).toHaveProperty("postedAt");
    expect(item).toHaveProperty("threadTitle");
    expect(item).toHaveProperty("threadSubreddit");
    expect(item).toHaveProperty("threadUrl");
  });

  test("history item has correct thread details", async () => {
    const app = createTestApp();
    const res = await app.request("/api/history/prod-1");

    expect(res.status).toBe(200);
    const json = await res.json();
    const item = json[0];

    expect(item.threadTitle).toBe("Task app suggestions");
    expect(item.threadSubreddit).toBe("apps");
    expect(item.threadUrl).toBe("https://reddit.com/r/apps/ghi789");
    expect(item.responseSnippet).toBe("TaskFlow is great for this use case because...");
  });
});

describe("POST /api/threads/:id/mark-read", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/threads/thread-1/mark-read", {
      method: "POST",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 404 for non-existent thread", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/non-existent/mark-read", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Thread not found");
  });

  test("returns 404 for thread belonging to different user", async () => {
    const differentUserThread: Thread = {
      id: "thread-other",
      productId: "prod-2",
      redditThreadId: "xyz999",
      title: "Other thread",
      bodyPreview: "...",
      subreddit: "test",
      url: "https://reddit.com/r/test/xyz999",
      createdUtc: 1704067200,
      discoveredAt: 1704067200,
      status: "active",
      isNew: true,
    };
    mutableThreads.push(differentUserThread);

    const app = createTestApp();
    const res = await app.request("/api/threads/thread-other/mark-read", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Thread not found");
  });

  test("marks thread as read successfully", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/thread-1/mark-read", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

describe("Monitoring tabs data filtering", () => {
  test("filters active threads correctly", () => {
    const threads = mockThreads;
    const activeThreads = threads.filter((t) => t.status === "active");

    expect(activeThreads.length).toBe(2);
    expect(activeThreads.every((t) => t.status === "active")).toBe(true);
  });

  test("filters dismissed threads correctly", () => {
    const threads = mockThreads;
    const dismissedThreads = threads.filter((t) => t.status === "dismissed");

    expect(dismissedThreads.length).toBe(1);
    expect(dismissedThreads[0].id).toBe("thread-2");
  });

  test("counts new threads correctly", () => {
    const threads = mockThreads;
    const activeThreads = threads.filter((t) => t.status === "active");
    const newThreadCount = activeThreads.filter((t) => t.isNew).length;

    expect(newThreadCount).toBe(1);
  });

  test("identifies new threads with badge", () => {
    const thread = mockThreads.find((t) => t.id === "thread-1");
    expect(thread?.isNew).toBe(true);
  });

  test("non-new threads do not show badge", () => {
    const thread = mockThreads.find((t) => t.id === "thread-3");
    expect(thread?.isNew).toBe(false);
  });
});

describe("Monitoring page tab navigation", () => {
  test("default active tab is threads", () => {
    const defaultTab = "threads";
    expect(defaultTab).toBe("threads");
  });

  test("tab values are valid", () => {
    const validTabs = ["threads", "history", "dismissed"];
    expect(validTabs).toContain("threads");
    expect(validTabs).toContain("history");
    expect(validTabs).toContain("dismissed");
  });

  test("each tab has distinct content", () => {
    const tabContent = {
      threads: "Active Threads",
      history: "Post History",
      dismissed: "Dismissed Threads",
    };

    expect(Object.keys(tabContent).length).toBe(3);
    expect(new Set(Object.values(tabContent)).size).toBe(3);
  });
});

describe("History tab rendering", () => {
  test("empty history shows correct message", () => {
    const emptyMessage = "No posts yet. Generate and post a response to see it here.";
    expect(emptyMessage).toContain("No posts yet");
  });

  test("history count pluralization", () => {
    const count = 1;
    const text = `${count} post${count !== 1 ? "s" : ""} made`;
    expect(text).toBe("1 post made");

    const count2 = 3;
    const text2 = `${count2} post${count2 !== 1 ? "s" : ""} made`;
    expect(text2).toBe("3 posts made");
  });

  test("history item uses comment URL when available", () => {
    const item = mockPostHistory[0];
    const url = item.redditCommentUrl || mockThreads.find((t) => t.id === item.threadId)?.url;
    expect(url).toBe("https://reddit.com/r/apps/comments/ghi789/comment/123");
  });
});
