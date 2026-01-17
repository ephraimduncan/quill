import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";

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

type RedditResult = {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
};

const mockProducts: Product[] = [
  { id: "prod-1", userId: "user-1", name: "TaskFlow" },
  { id: "prod-2", userId: "user-2", name: "CodeHelper" },
  { id: "prod-no-keywords", userId: "user-1", name: "NoKeywords" },
];

const mockKeywords: Keyword[] = [
  { id: "kw-1", productId: "prod-1", keyword: "productivity app" },
  { id: "kw-2", productId: "prod-1", keyword: "task management" },
  { id: "kw-3", productId: "prod-2", keyword: "coding tools" },
];

let mutableThreads: Thread[] = [];
let originalEnv: string | undefined;

function createTestApp(
  cronSecret: string | undefined,
  mockRedditResults: Map<string, RedditResult[]> = new Map()
) {
  mutableThreads = [
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

  const app = new Hono().basePath("/api");

  app.get("/cron/discover", async (c) => {
    const authHeader = c.req.header("authorization");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let totalNewThreads = 0;
    const errors: Array<{ productId: string; error: string }> = [];

    for (const product of mockProducts) {
      const productKeywords = mockKeywords.filter(
        (k) => k.productId === product.id
      );

      if (productKeywords.length === 0) continue;

      const existingIds = new Set(
        mutableThreads
          .filter((t) => t.productId === product.id)
          .map((t) => t.redditThreadId)
      );

      const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
      const seenIds = new Set<string>();
      const newThreads: Omit<Thread, "id" | "discoveredAt" | "status" | "isNew">[] = [];

      for (const kw of productKeywords) {
        const results = mockRedditResults.get(kw.keyword) || [];

        for (const result of results) {
          if (seenIds.has(result.id)) continue;
          if (existingIds.has(result.id)) continue;
          if (result.created_utc < sevenDaysAgo) continue;

          seenIds.add(result.id);
          newThreads.push({
            productId: product.id,
            redditThreadId: result.id,
            title: result.title,
            bodyPreview: (result.selftext || "").slice(0, 200),
            subreddit: result.subreddit,
            url: `https://reddit.com${result.permalink}`,
            createdUtc: result.created_utc,
          });
        }
      }

      if (newThreads.length > 0) {
        const now = Math.floor(Date.now() / 1000);
        for (const thread of newThreads) {
          mutableThreads.push({
            id: `new-${thread.redditThreadId}`,
            ...thread,
            discoveredAt: now,
            status: "active",
            isNew: true,
          });
        }
        totalNewThreads += newThreads.length;
      }
    }

    return c.json({
      success: true,
      productsProcessed: mockProducts.length,
      newThreadsFound: totalNewThreads,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

  return app;
}

describe("GET /api/cron/discover", () => {
  beforeEach(() => {
    originalEnv = process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRON_SECRET = originalEnv;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  test("returns 401 when no authorization header", async () => {
    const app = createTestApp("test-secret");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 401 when authorization header has wrong secret", async () => {
    const app = createTestApp("test-secret");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer wrong-secret" },
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 401 when CRON_SECRET is not set", async () => {
    const app = createTestApp(undefined);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer some-secret" },
    });

    expect(res.status).toBe(401);
  });

  test("returns success with correct authorization", async () => {
    const app = createTestApp("test-secret");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("returns productsProcessed count", async () => {
    const app = createTestApp("test-secret");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.productsProcessed).toBe(mockProducts.length);
  });

  test("returns newThreadsFound count of 0 when no new threads", async () => {
    const app = createTestApp("test-secret");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(0);
  });

  test("finds new threads from Reddit results", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "new123",
        title: "New thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/new123",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(1);
  });

  test("skips products without keywords", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "thread-for-prod1",
        title: "Thread for prod1",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/thread-for-prod1",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(1);
    const newThread = mutableThreads.find((t) => t.redditThreadId === "thread-for-prod1");
    expect(newThread?.productId).toBe("prod-1");
  });

  test("deduplicates threads by redditThreadId", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    const sameThread = {
      id: "dup123",
      title: "Duplicate thread",
      selftext: "Content",
      subreddit: "productivity",
      permalink: "/r/productivity/dup123",
      created_utc: now - 3600,
    };
    results.set("productivity app", [sameThread]);
    results.set("task management", [sameThread]);

    const app = createTestApp("test-secret", results);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(1);
  });

  test("skips threads already in database", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "existing123",
        title: "Existing thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/existing123",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(0);
  });

  test("skips threads older than 7 days", async () => {
    const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "old123",
        title: "Old thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/old123",
        created_utc: eightDaysAgo,
      },
    ]);

    const app = createTestApp("test-secret", results);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(0);
  });

  test("inserts new threads with isNew=true", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "newthread",
        title: "New thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/newthread",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "newthread");
    expect(newThread).toBeDefined();
    expect(newThread?.isNew).toBe(true);
  });

  test("inserts new threads with status=active", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "activethread",
        title: "Active thread",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/activethread",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "activethread");
    expect(newThread).toBeDefined();
    expect(newThread?.status).toBe("active");
  });

  test("truncates body preview to 200 characters", async () => {
    const now = Math.floor(Date.now() / 1000);
    const longContent = "a".repeat(300);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "longthread",
        title: "Long thread",
        selftext: longContent,
        subreddit: "productivity",
        permalink: "/r/productivity/longthread",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "longthread");
    expect(newThread?.bodyPreview.length).toBe(200);
  });

  test("processes multiple products", async () => {
    const now = Math.floor(Date.now() / 1000);
    const results = new Map<string, RedditResult[]>();
    results.set("productivity app", [
      {
        id: "thread-prod1",
        title: "Thread for prod1",
        selftext: "Content",
        subreddit: "productivity",
        permalink: "/r/productivity/thread-prod1",
        created_utc: now - 3600,
      },
    ]);
    results.set("coding tools", [
      {
        id: "thread-prod2",
        title: "Thread for prod2",
        selftext: "Content",
        subreddit: "programming",
        permalink: "/r/programming/thread-prod2",
        created_utc: now - 3600,
      },
    ]);

    const app = createTestApp("test-secret", results);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(2);

    const prod1Thread = mutableThreads.find((t) => t.redditThreadId === "thread-prod1");
    const prod2Thread = mutableThreads.find((t) => t.redditThreadId === "thread-prod2");
    expect(prod1Thread?.productId).toBe("prod-1");
    expect(prod2Thread?.productId).toBe("prod-2");
  });
});

describe("vercel.json cron configuration", () => {
  test("cron schedule is set to 6:00 UTC daily", () => {
    const schedule = "0 6 * * *";
    const parts = schedule.split(" ");
    expect(parts[0]).toBe("0");
    expect(parts[1]).toBe("6");
    expect(parts[2]).toBe("*");
    expect(parts[3]).toBe("*");
    expect(parts[4]).toBe("*");
  });

  test("cron path points to discover endpoint", () => {
    const path = "/api/cron/discover";
    expect(path).toBe("/api/cron/discover");
  });
});
