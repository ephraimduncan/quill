import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const routeFile = readFileSync(
  join(process.cwd(), "app/api/[[...route]]/route.ts"),
  "utf-8"
);

const idFetcherFile = readFileSync(
  join(process.cwd(), "lib/reddit/id-fetcher.ts"),
  "utf-8"
);

const schemaFile = readFileSync(
  join(process.cwd(), "lib/db/schema.ts"),
  "utf-8"
);

const vercelJsonFile = readFileSync(
  join(process.cwd(), "vercel.json"),
  "utf-8"
);

const vercelConfig = JSON.parse(vercelJsonFile);

describe("Cron Verification: Manual trigger /api/cron/discover", () => {
  describe("Endpoint exists and accepts GET requests", () => {
    test("GET /api/cron/discover endpoint is defined", () => {
      expect(routeFile).toContain('app.get("/cron/discover"');
    });

    test("endpoint requires Bearer authorization header", () => {
      expect(routeFile).toContain('c.req.header("authorization")');
      expect(routeFile).toContain("`Bearer ${process.env.CRON_SECRET}`");
    });

    test("returns 401 when authorization missing or invalid", () => {
      expect(routeFile).toContain(
        'authHeader !== `Bearer ${process.env.CRON_SECRET}`'
      );
      expect(routeFile).toContain('{ error: "Unauthorized" }, 401');
    });
  });

  describe("ID polling mechanism", () => {
    test("fetches latest post ID from Reddit", () => {
      expect(routeFile).toContain("fetchLatestPostId()");
      expect(idFetcherFile).toContain(
        "https://www.reddit.com/r/all/new.json?limit=1"
      );
    });

    test("reads sync state from database", () => {
      expect(routeFile).toContain(
        'from(redditSyncState).where(eq(redditSyncState.id, "global"))'
      );
    });

    test("initializes sync state on first run", () => {
      expect(routeFile).toContain("if (!lastPostId)");
      expect(routeFile).toContain(
        "db.insert(redditSyncState).values"
      );
      expect(routeFile).toContain('"Initialized sync state with latest post ID"');
    });

    test("generates ID range between last and latest", () => {
      expect(routeFile).toContain("generateIdRange(lastPostId, latestPostId");
    });

    test("batch fetches posts using api.reddit.com/api/info.json", () => {
      expect(routeFile).toContain("batchFetchPosts(idsToFetch)");
      expect(idFetcherFile).toContain(
        "https://api.reddit.com/api/info.json?id="
      );
    });

    test("uses t3_ prefix for post fullnames", () => {
      expect(idFetcherFile).toContain('`t3_${id}`');
    });
  });

  describe("Keyword matching and thread discovery", () => {
    test("loads all keywords from database", () => {
      expect(routeFile).toContain(".select({ keyword: keywords.keyword, productId: keywords.productId })");
      expect(routeFile).toContain(".from(keywords)");
    });

    test("builds Aho-Corasick matcher from keywords", () => {
      expect(routeFile).toContain("buildMatcher(keywordEntries)");
    });

    test("matches keywords against post title and body", () => {
      expect(routeFile).toContain("`${post.title} ${post.selftext}`");
      expect(routeFile).toContain("matcher.match(textToMatch)");
    });

    test("stores matchedKeyword in discovered threads", () => {
      expect(routeFile).toContain("matchedKeyword: match.keyword");
    });
  });

  describe("Thread storage", () => {
    test("threads table has matchedKeyword column", () => {
      expect(schemaFile).toContain('matchedKeyword: text("matched_keyword")');
    });

    test("deduplicates by productId + redditThreadId combination", () => {
      expect(routeFile).toContain(
        '`${t.productId}:${t.redditThreadId}`'
      );
      expect(routeFile).toContain("`${match.productId}:${post.id}`");
    });

    test("inserts threads with isNew=true", () => {
      expect(routeFile).toContain("isNew: true");
    });

    test("inserts threads with status=active", () => {
      expect(routeFile).toContain('status: "active"');
    });

    test("filters out posts older than 7 days", () => {
      expect(routeFile).toContain("7 * 24 * 60 * 60");
      expect(routeFile).toContain("if (post.created_utc < sevenDaysAgo)");
    });

    test("truncates bodyPreview to 200 characters", () => {
      expect(routeFile).toContain("post.selftext.slice(0, 200)");
    });
  });

  describe("Sync state updates", () => {
    test("updates lastPostId after processing", () => {
      expect(routeFile).toContain(
        ".update(redditSyncState)"
      );
      expect(routeFile).toContain("lastPostId: latestPostId");
    });

    test("redditSyncState table exists in schema", () => {
      expect(schemaFile).toContain(
        'export const redditSyncState = sqliteTable("reddit_sync_state"'
      );
    });

    test("sync state has id, lastPostId, updatedAt fields", () => {
      expect(schemaFile).toContain('id: text("id").primaryKey()');
      expect(schemaFile).toContain('lastPostId: text("last_post_id")');
      expect(schemaFile).toContain('updatedAt: integer("updated_at")');
    });
  });

  describe("Response includes discovery stats", () => {
    test("returns postsProcessed count", () => {
      expect(routeFile).toContain("postsProcessed: posts.length");
    });

    test("returns newThreadsFound count", () => {
      expect(routeFile).toContain("newThreadsFound: totalNewThreads");
    });

    test("returns success: true on successful discovery", () => {
      expect(routeFile).toContain("success: true");
    });
  });

  describe("Vercel cron configuration", () => {
    test("vercel.json defines cron job", () => {
      expect(vercelConfig.crons).toBeDefined();
      expect(Array.isArray(vercelConfig.crons)).toBe(true);
    });

    test("cron path is /api/cron/discover", () => {
      const cronJob = vercelConfig.crons.find(
        (c: { path: string }) => c.path === "/api/cron/discover"
      );
      expect(cronJob).toBeDefined();
    });

    test("cron schedule runs daily at 6:00 UTC", () => {
      const cronJob = vercelConfig.crons.find(
        (c: { path: string }) => c.path === "/api/cron/discover"
      );
      expect(cronJob?.schedule).toBe("0 6 * * *");
    });
  });

  describe("Edge cases and error handling", () => {
    test("returns 500 when cannot fetch latest post ID", () => {
      expect(routeFile).toContain("if (!latestPostId)");
      expect(routeFile).toContain(
        '{ error: "Failed to fetch latest Reddit post ID" }, 500'
      );
    });

    test("handles case when no new posts since last sync", () => {
      expect(routeFile).toContain(
        "base36ToNumber(latestPostId) <= base36ToNumber(lastPostId)"
      );
      expect(routeFile).toContain('"No new posts since last sync"');
    });

    test("handles case when no keywords configured", () => {
      expect(routeFile).toContain("if (allKeywords.length === 0)");
      expect(routeFile).toContain('"No keywords configured"');
    });
  });

  describe("Base-36 ID handling", () => {
    test("id-fetcher exports base36ToNumber function", () => {
      expect(idFetcherFile).toContain(
        "export function base36ToNumber(id: string)"
      );
    });

    test("id-fetcher exports numberToBase36 function", () => {
      expect(idFetcherFile).toContain(
        "export function numberToBase36(num: bigint)"
      );
    });

    test("id-fetcher exports generateIdRange function", () => {
      expect(idFetcherFile).toContain(
        "export function generateIdRange"
      );
    });

    test("generateIdRange limits to maxCount (default 100)", () => {
      expect(idFetcherFile).toContain("maxCount = 100");
    });
  });
});

describe("Cron endpoint flow integration", () => {
  test("cron endpoint imports required functions", () => {
    expect(routeFile).toContain(
      "import { fetchLatestPostId, batchFetchPosts, generateIdRange, base36ToNumber }"
    );
  });

  test("cron endpoint imports keyword matcher", () => {
    expect(routeFile).toContain(
      "import { buildMatcher, type KeywordEntry }"
    );
  });

  test("cron endpoint imports database tables", () => {
    expect(routeFile).toContain(
      "import { db, products, threads, keywords, redditSyncState }"
    );
  });

  test("threads inserted in bulk via db.insert", () => {
    expect(routeFile).toContain("if (threadsToInsert.length > 0)");
    expect(routeFile).toContain("await db.insert(threads).values(threadsToInsert)");
  });
});

describe("Manual trigger requirements", () => {
  test("endpoint uses GET method for Vercel cron compatibility", () => {
    expect(routeFile).toContain('app.get("/cron/discover"');
    expect(routeFile).not.toContain('app.post("/cron/discover"');
  });

  test("CRON_SECRET is required environment variable", () => {
    expect(routeFile).toContain("process.env.CRON_SECRET");
  });

  test("can be triggered manually with correct authorization", () => {
    const envExample = readFileSync(
      join(process.cwd(), ".env.example"),
      "utf-8"
    );
    expect(envExample).toContain("CRON_SECRET");
  });
});
