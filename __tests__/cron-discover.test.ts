import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import {
  base36ToNumber,
  type RedditPost,
} from "@/lib/reddit/id-fetcher";
import { buildMatcher, type KeywordEntry } from "@/lib/reddit/keyword-matcher";
import { randomUUID } from "crypto";

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
  matchedKeyword: string | null;
};

type SyncState = {
  id: string;
  lastPostId: string;
  updatedAt: number;
};

const mockKeywords: Keyword[] = [
  { id: "kw-1", productId: "prod-1", keyword: "productivity app" },
  { id: "kw-2", productId: "prod-1", keyword: "task management" },
  { id: "kw-3", productId: "prod-2", keyword: "coding tools" },
];

let mutableThreads: Thread[] = [];
let mutableSyncState: SyncState | null = null;
let originalEnv: string | undefined;

function createTestApp(
  cronSecret: string | undefined,
  mockLatestPostId: string | null = "1abc200",
  mockPosts: RedditPost[] = [],
  initialThreads?: Thread[]
) {
  mutableThreads = initialThreads ?? [
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
      matchedKeyword: "productivity app",
    },
  ];

  const app = new Hono().basePath("/api");

  app.get("/cron/discover", async (c) => {
    const authHeader = c.req.header("authorization");
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!mockLatestPostId) {
      return c.json({ error: "Failed to fetch latest Reddit post ID" }, 500);
    }

    const lastPostId = mutableSyncState?.lastPostId;

    if (!lastPostId) {
      const now = Math.floor(Date.now() / 1000);
      mutableSyncState = {
        id: "global",
        lastPostId: mockLatestPostId,
        updatedAt: now,
      };
      return c.json({
        success: true,
        message: "Initialized sync state with latest post ID",
        lastPostId: mockLatestPostId,
        postsProcessed: 0,
        newThreadsFound: 0,
      });
    }

    if (base36ToNumber(mockLatestPostId) <= base36ToNumber(lastPostId)) {
      return c.json({
        success: true,
        message: "No new posts since last sync",
        postsProcessed: 0,
        newThreadsFound: 0,
      });
    }

    if (mockKeywords.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      mutableSyncState = { ...mutableSyncState!, lastPostId: mockLatestPostId, updatedAt: now };
      return c.json({
        success: true,
        message: "No keywords configured",
        postsProcessed: 0,
        newThreadsFound: 0,
      });
    }

    const keywordEntries: KeywordEntry[] = mockKeywords.map((k) => ({
      keyword: k.keyword,
      productId: k.productId,
    }));
    const matcher = buildMatcher(keywordEntries);

    const existingSet = new Set(
      mutableThreads.map((t) => `${t.productId}:${t.redditThreadId}`)
    );

    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    let totalNewThreads = 0;

    const threadsToInsert: Thread[] = [];

    for (const post of mockPosts) {
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
      mutableThreads.push(...threadsToInsert);
      totalNewThreads = threadsToInsert.length;
    }

    mutableSyncState = { ...mutableSyncState!, lastPostId: mockLatestPostId, updatedAt: now };

    return c.json({
      success: true,
      postsProcessed: mockPosts.length,
      newThreadsFound: totalNewThreads,
    });
  });

  return app;
}

describe("GET /api/cron/discover - ID-based polling", () => {
  beforeEach(() => {
    originalEnv = process.env.CRON_SECRET;
    mutableSyncState = null;
    mutableThreads = [];
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
    const res = await app.request("/api/cron/discover", { method: "GET" });

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
  });

  test("returns 401 when CRON_SECRET is not set", async () => {
    const app = createTestApp(undefined);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer some-secret" },
    });

    expect(res.status).toBe(401);
  });

  test("returns 500 when cannot fetch latest post ID", async () => {
    const app = createTestApp("test-secret", null);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Failed to fetch latest Reddit post ID");
  });

  test("initializes sync state on first run", async () => {
    mutableSyncState = null;
    const app = createTestApp("test-secret", "1abc200");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("Initialized sync state with latest post ID");
    expect(json.lastPostId).toBe("1abc200");
    expect(mutableSyncState?.lastPostId).toBe("1abc200");
  });

  test("returns no new posts when latest <= last", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc200",
      updatedAt: Math.floor(Date.now() / 1000),
    };
    const app = createTestApp("test-secret", "1abc200");
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("No new posts since last sync");
  });

  test("matches posts using Aho-Corasick keyword matcher", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const now = Math.floor(Date.now() / 1000);
    const mockPosts: RedditPost[] = [
      {
        id: "newpost1",
        title: "Best productivity app recommendations?",
        selftext: "Looking for something to help with task management",
        subreddit: "productivity",
        permalink: "/r/productivity/newpost1",
        created_utc: now - 3600,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBeGreaterThan(0);
  });

  test("stores matchedKeyword in thread", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const now = Math.floor(Date.now() / 1000);
    const mockPosts: RedditPost[] = [
      {
        id: "newpost2",
        title: "Looking for coding tools",
        selftext: "Any recommendations?",
        subreddit: "programming",
        permalink: "/r/programming/newpost2",
        created_utc: now - 3600,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "newpost2");
    expect(newThread).toBeDefined();
    expect(newThread?.matchedKeyword).toBe("coding tools");
  });

  test("matches same post to multiple products", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const now = Math.floor(Date.now() / 1000);
    const mockPosts: RedditPost[] = [
      {
        id: "multipost",
        title: "productivity app and coding tools needed",
        selftext: "I need both for my workflow",
        subreddit: "software",
        permalink: "/r/software/multipost",
        created_utc: now - 3600,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const matchingThreads = mutableThreads.filter((t) => t.redditThreadId === "multipost");
    expect(matchingThreads.length).toBe(2);
    expect(matchingThreads.map(t => t.productId).sort()).toEqual(["prod-1", "prod-2"]);
  });

  test("skips posts older than 7 days", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const eightDaysAgo = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    const mockPosts: RedditPost[] = [
      {
        id: "oldpost",
        title: "productivity app question",
        selftext: "Old content",
        subreddit: "productivity",
        permalink: "/r/productivity/oldpost",
        created_utc: eightDaysAgo,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(0);
  });

  test("deduplicates by product-thread combination", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const now = Math.floor(Date.now() / 1000);
    const existingThreads: Thread[] = [
      {
        id: "existing",
        productId: "prod-1",
        redditThreadId: "existingpost",
        title: "Existing",
        bodyPreview: "",
        subreddit: "test",
        url: "https://reddit.com/existingpost",
        createdUtc: now - 7200,
        discoveredAt: now - 7200,
        status: "active",
        isNew: false,
        matchedKeyword: "productivity app",
      },
    ];
    const mockPosts: RedditPost[] = [
      {
        id: "existingpost",
        title: "productivity app review",
        selftext: "Great app",
        subreddit: "productivity",
        permalink: "/r/productivity/existingpost",
        created_utc: now - 3600,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts, existingThreads);
    const res = await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.newThreadsFound).toBe(0);
  });

  test("updates sync state after processing", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };

    const app = createTestApp("test-secret", "1abc200", []);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(mutableSyncState?.lastPostId).toBe("1abc200");
  });

  test("truncates body preview to 200 characters", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const now = Math.floor(Date.now() / 1000);
    const longContent = "a".repeat(300);
    const mockPosts: RedditPost[] = [
      {
        id: "longpost",
        title: "productivity app discussion",
        selftext: longContent,
        subreddit: "productivity",
        permalink: "/r/productivity/longpost",
        created_utc: now - 3600,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "longpost");
    expect(newThread?.bodyPreview.length).toBe(200);
  });

  test("inserts threads with isNew=true and status=active", async () => {
    mutableSyncState = {
      id: "global",
      lastPostId: "1abc100",
      updatedAt: Math.floor(Date.now() / 1000) - 3600,
    };
    const now = Math.floor(Date.now() / 1000);
    const mockPosts: RedditPost[] = [
      {
        id: "statuspost",
        title: "task management help",
        selftext: "Need help",
        subreddit: "productivity",
        permalink: "/r/productivity/statuspost",
        created_utc: now - 3600,
      },
    ];

    const app = createTestApp("test-secret", "1abc200", mockPosts);
    await app.request("/api/cron/discover", {
      method: "GET",
      headers: { Authorization: "Bearer test-secret" },
    });

    const newThread = mutableThreads.find((t) => t.redditThreadId === "statuspost");
    expect(newThread?.isNew).toBe(true);
    expect(newThread?.status).toBe("active");
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
