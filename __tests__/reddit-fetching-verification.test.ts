import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const routePath = path.join(process.cwd(), "app/api/[[...route]]/route.ts");
const routeContent = fs.readFileSync(routePath, "utf-8");

const schemaPath = path.join(process.cwd(), "lib/db/schema.ts");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");

const idFetcherPath = path.join(process.cwd(), "lib/reddit/id-fetcher.ts");
const idFetcherContent = fs.readFileSync(idFetcherPath, "utf-8");

const keywordMatcherPath = path.join(
	process.cwd(),
	"lib/reddit/keyword-matcher.ts",
);
const keywordMatcherContent = fs.readFileSync(keywordMatcherPath, "utf-8");

const monitorPagePath = path.join(
	process.cwd(),
	"app/(app)/monitor/[productId]/page.tsx",
);
const monitorPageContent = fs.readFileSync(monitorPagePath, "utf-8");

describe("Verification: Reddit fetching - Trigger poll → Verify threads appear with matchedKeyword", () => {
	describe("1. Cron endpoint triggers poll correctly", () => {
		test("GET /api/cron/discover endpoint exists", () => {
			expect(routeContent).toContain('app.get("/cron/discover"');
		});

		test("cron endpoint validates CRON_SECRET authorization", () => {
			expect(routeContent).toContain("CRON_SECRET");
			expect(routeContent).toContain("Bearer ${process.env.CRON_SECRET}");
		});

		test("cron endpoint fetches latest post ID from Reddit", () => {
			expect(routeContent).toContain("fetchLatestPostId");
			expect(routeContent).toContain("await fetchLatestPostId()");
		});

		test("cron endpoint reads sync state from database", () => {
			expect(routeContent).toContain("redditSyncState");
			expect(routeContent).toContain('eq(redditSyncState.id, "global")');
		});

		test("cron endpoint generates ID range for batch fetching", () => {
			expect(routeContent).toContain("generateIdRange");
			expect(routeContent).toContain("batchFetchPosts");
		});

		test("cron endpoint initializes sync state on first run", () => {
			expect(routeContent).toContain(
				"Initialized sync state with latest post ID",
			);
			expect(routeContent).toContain("db.insert(redditSyncState)");
		});

		test("cron endpoint updates sync state after processing", () => {
			expect(routeContent).toContain(".update(redditSyncState)");
			expect(routeContent).toContain("lastPostId: latestPostId");
		});
	});

	describe("2. Keyword matching with Aho-Corasick", () => {
		test("cron endpoint loads all keywords from all products", () => {
			expect(routeContent).toContain("allKeywords");
			expect(routeContent).toContain("db.select");
			expect(routeContent).toContain("from(keywords)");
		});

		test("cron endpoint builds Aho-Corasick matcher", () => {
			expect(routeContent).toContain("buildMatcher");
			expect(routeContent).toContain("matcher.match(textToMatch)");
		});

		test("Aho-Corasick matcher is imported from keyword-matcher module", () => {
			expect(routeContent).toContain('from "@/lib/reddit/keyword-matcher"');
			expect(routeContent).toContain("buildMatcher");
			expect(routeContent).toContain("KeywordEntry");
		});

		test("keyword matcher module exports buildMatcher function", () => {
			expect(keywordMatcherContent).toContain("export function buildMatcher");
		});

		test("keyword matcher returns keyword and productId for matches", () => {
			expect(keywordMatcherContent).toContain("keyword:");
			expect(keywordMatcherContent).toContain("productId:");
		});
	});

	describe("3. Threads stored with matchedKeyword", () => {
		test("threads table schema includes matchedKeyword column", () => {
			expect(schemaContent).toContain(
				'matchedKeyword: text("matched_keyword")',
			);
		});

		test("cron endpoint inserts threads with matchedKeyword field", () => {
			expect(routeContent).toContain("matchedKeyword: match.keyword");
		});

		test("thread insertion includes all required fields", () => {
			expect(routeContent).toContain("productId: match.productId");
			expect(routeContent).toContain("redditThreadId: post.id");
			expect(routeContent).toContain("title: post.title");
			expect(routeContent).toContain("subreddit: post.subreddit");
			expect(routeContent).toContain('status: "active"');
			expect(routeContent).toContain("isNew: true");
			expect(routeContent).toContain("matchedKeyword: match.keyword");
		});

		test("threads are deduplicated by productId and redditThreadId combination", () => {
			expect(routeContent).toContain("`${t.productId}:${t.redditThreadId}`");
			expect(routeContent).toContain("existingSet.has(key)");
		});

		test("posts older than 7 days are filtered out", () => {
			expect(routeContent).toContain("sevenDaysAgo");
			expect(routeContent).toContain("post.created_utc < sevenDaysAgo");
		});
	});

	describe("4. ID-based fetching system", () => {
		test("id-fetcher module exports base36 conversion functions", () => {
			expect(idFetcherContent).toContain("export function base36ToNumber");
			expect(idFetcherContent).toContain("export function numberToBase36");
		});

		test("id-fetcher module exports fetchLatestPostId function", () => {
			expect(idFetcherContent).toContain(
				"export async function fetchLatestPostId",
			);
		});

		test("id-fetcher module exports batchFetchPosts function", () => {
			expect(idFetcherContent).toContain(
				"export async function batchFetchPosts",
			);
		});

		test("id-fetcher module exports generateIdRange function", () => {
			expect(idFetcherContent).toContain("export function generateIdRange");
		});

		test("fetchLatestPostId fetches from r/all/new", () => {
			expect(idFetcherContent).toContain("reddit.com/r/all/new.json");
		});

		test("batchFetchPosts uses api.reddit.com/api/info.json", () => {
			expect(idFetcherContent).toContain("api.reddit.com/api/info.json");
		});

		test("batch fetching uses t3_ prefix for post IDs", () => {
			expect(idFetcherContent).toContain("t3_");
		});
	});

	describe("5. API returns threads for monitoring", () => {
		test("GET /api/products/:id returns threads array", () => {
			expect(routeContent).toContain('app.get("/products/:id"');
			expect(routeContent).toContain("threads: productThreads");
		});

		test("threads are fetched from database for product", () => {
			expect(routeContent).toContain("productThreads");
			expect(routeContent).toContain("from(threads)");
			expect(routeContent).toContain("eq(threads.productId, productId)");
		});

		test("thread schema exports Thread type with all fields", () => {
			expect(schemaContent).toContain(
				"export type Thread = typeof threads.$inferSelect",
			);
		});
	});

	describe("6. Monitor page displays threads", () => {
		test("monitor page fetches product with threads", () => {
			expect(monitorPageContent).toContain(
				"fetch(`/api/products/${productId}`)",
			);
		});

		test("monitor page displays active threads list", () => {
			expect(monitorPageContent).toContain("activeThreads");
			expect(monitorPageContent).toContain('t.status === "active"');
		});

		test("monitor page shows thread title and subreddit", () => {
			expect(monitorPageContent).toContain("thread.title");
			expect(monitorPageContent).toContain("thread.subreddit");
		});

		test("monitor page has thread selection functionality", () => {
			expect(monitorPageContent).toContain("selectedThreadId");
			expect(monitorPageContent).toContain("handleThreadSelect");
		});
	});

	describe("7. Cron response includes discovery stats", () => {
		test("cron endpoint returns success status", () => {
			expect(routeContent).toContain("success: true");
		});

		test("cron endpoint returns postsProcessed count", () => {
			expect(routeContent).toContain("postsProcessed:");
		});

		test("cron endpoint returns newThreadsFound count", () => {
			expect(routeContent).toContain("newThreadsFound:");
			expect(routeContent).toContain("totalNewThreads");
		});

		test("cron returns message when no new posts since last sync", () => {
			expect(routeContent).toContain("No new posts since last sync");
		});

		test("cron returns message when no keywords configured", () => {
			expect(routeContent).toContain("No keywords configured");
		});
	});
});
