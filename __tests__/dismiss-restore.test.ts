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
];

const initialThreads: Thread[] = [
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
    productId: "prod-2",
    redditThreadId: "ghi789",
    title: "Other user thread",
    bodyPreview: "...",
    subreddit: "test",
    url: "https://reddit.com/r/test/ghi789",
    createdUtc: 1704150000,
    discoveredAt: 1704150000,
    status: "active",
    isNew: false,
  },
];

let mutableThreads: Thread[] = [];

function createTestApp(authenticated = true) {
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

  app.post("/threads/:id/dismiss", async (c) => {
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
    mutableThreads[threadIndex] = { ...mutableThreads[threadIndex], status: "dismissed" };

    return c.json({ success: true });
  });

  app.post("/threads/:id/restore", async (c) => {
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
    mutableThreads[threadIndex] = { ...mutableThreads[threadIndex], status: "active" };

    return c.json({ success: true });
  });

  return app;
}

describe("POST /api/threads/:id/dismiss", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/threads/thread-1/dismiss", {
      method: "POST",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 404 for non-existent thread", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/non-existent/dismiss", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Thread not found");
  });

  test("returns 404 for thread belonging to different user", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/thread-3/dismiss", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Thread not found");
  });

  test("dismisses thread successfully", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/thread-1/dismiss", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("changes thread status to dismissed", async () => {
    const app = createTestApp();
    await app.request("/api/threads/thread-1/dismiss", {
      method: "POST",
    });

    const thread = mutableThreads.find((t) => t.id === "thread-1");
    expect(thread?.status).toBe("dismissed");
  });
});

describe("POST /api/threads/:id/restore", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/threads/thread-2/restore", {
      method: "POST",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 404 for non-existent thread", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/non-existent/restore", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Thread not found");
  });

  test("returns 404 for thread belonging to different user", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/thread-3/restore", {
      method: "POST",
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Thread not found");
  });

  test("restores thread successfully", async () => {
    const app = createTestApp();
    const res = await app.request("/api/threads/thread-2/restore", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("changes thread status to active", async () => {
    const app = createTestApp();
    await app.request("/api/threads/thread-2/restore", {
      method: "POST",
    });

    const thread = mutableThreads.find((t) => t.id === "thread-2");
    expect(thread?.status).toBe("active");
  });
});

describe("Dismiss/Restore UI state changes", () => {
  test("dismissing moves thread from active to dismissed list", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], status: "active" },
      { ...initialThreads[1], status: "dismissed" },
    ];

    const activeThreads = threads.filter((t) => t.status === "active");
    const dismissedThreads = threads.filter((t) => t.status === "dismissed");

    expect(activeThreads.length).toBe(1);
    expect(dismissedThreads.length).toBe(1);

    const threadToUpdate = threads.find((t) => t.id === "thread-1");
    if (threadToUpdate) threadToUpdate.status = "dismissed";

    const updatedActive = threads.filter((t) => t.status === "active");
    const updatedDismissed = threads.filter((t) => t.status === "dismissed");

    expect(updatedActive.length).toBe(0);
    expect(updatedDismissed.length).toBe(2);
  });

  test("restoring moves thread from dismissed to active list", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], status: "active" },
      { ...initialThreads[1], status: "dismissed" },
    ];

    const threadToUpdate = threads.find((t) => t.id === "thread-2");
    if (threadToUpdate) threadToUpdate.status = "active";

    const updatedActive = threads.filter((t) => t.status === "active");
    const updatedDismissed = threads.filter((t) => t.status === "dismissed");

    expect(updatedActive.length).toBe(2);
    expect(updatedDismissed.length).toBe(0);
  });

  test("after dismiss, selection moves to next active thread", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], id: "t1", status: "active" },
      { ...initialThreads[0], id: "t2", status: "active" },
      { ...initialThreads[0], id: "t3", status: "active" },
    ];

    let selectedId = "t1";
    const dismissedId = "t1";

    const remaining = threads.filter(
      (t) => t.status === "active" && t.id !== dismissedId
    );

    if (remaining.length > 0) {
      selectedId = remaining[0].id;
    } else {
      selectedId = "";
    }

    expect(selectedId).toBe("t2");
  });

  test("after dismiss last thread, selection becomes null", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], id: "t1", status: "active" },
    ];

    let selectedId: string | null = "t1";
    const dismissedId = "t1";

    const remaining = threads.filter(
      (t) => t.status === "active" && t.id !== dismissedId
    );

    if (remaining.length > 0) {
      selectedId = remaining[0].id;
    } else {
      selectedId = null;
    }

    expect(selectedId).toBeNull();
  });
});

describe("Dismiss/Restore integration with thread counts", () => {
  test("dismissing thread decreases active count", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], status: "active" },
      { ...initialThreads[0], id: "t2", status: "active" },
    ];

    const initialActiveCount = threads.filter((t) => t.status === "active").length;
    expect(initialActiveCount).toBe(2);

    threads[0].status = "dismissed";

    const finalActiveCount = threads.filter((t) => t.status === "active").length;
    expect(finalActiveCount).toBe(1);
  });

  test("restoring thread increases active count", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], status: "dismissed" },
      { ...initialThreads[0], id: "t2", status: "active" },
    ];

    const initialActiveCount = threads.filter((t) => t.status === "active").length;
    expect(initialActiveCount).toBe(1);

    threads[0].status = "active";

    const finalActiveCount = threads.filter((t) => t.status === "active").length;
    expect(finalActiveCount).toBe(2);
  });

  test("dismissing new thread decreases new thread badge count", () => {
    const threads: Thread[] = [
      { ...initialThreads[0], status: "active", isNew: true },
      { ...initialThreads[0], id: "t2", status: "active", isNew: true },
    ];

    const initialNewCount = threads.filter(
      (t) => t.status === "active" && t.isNew
    ).length;
    expect(initialNewCount).toBe(2);

    threads[0].status = "dismissed";

    const finalNewCount = threads.filter(
      (t) => t.status === "active" && t.isNew
    ).length;
    expect(finalNewCount).toBe(1);
  });
});
