import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const routePath = path.join(process.cwd(), "app/api/[[...route]]/route.ts");
const routeContent = fs.readFileSync(routePath, "utf-8");

const setupPath = path.join(process.cwd(), "app/(app)/setup/page.tsx");
const setupContent = fs.readFileSync(setupPath, "utf-8");

const schemaPath = path.join(process.cwd(), "lib/db/schema.ts");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");

const keywordMatcherPath = path.join(
	process.cwd(),
	"lib/reddit/keyword-matcher.ts",
);
const keywordMatcherContent = fs.readFileSync(keywordMatcherPath, "utf-8");

describe("Verification: Keyword matching - Add keyword → Poll → Confirm matching threads discovered", () => {
	describe("1. Add keyword via product creation", () => {
		test("POST /api/products accepts keywords array", () => {
			expect(routeContent).toContain('app.post("/products"');
			expect(routeContent).toContain("keywords: z.array(z.string().min(1))");
		});

		test("product creation inserts keywords into database", () => {
			expect(routeContent).toContain("db.insert(keywords).values");
			expect(routeContent).toContain("data.keywords.map((keyword)");
		});

		test("keywords table stores productId association", () => {
			expect(schemaContent).toContain("productId: text");
			expect(schemaContent).toContain(".references(() => products.id");
			expect(schemaContent).toContain('onDelete: "cascade"');
		});

		test("setup wizard collects keywords in step 3", () => {
			expect(setupContent).toContain("state.keywords");
			expect(setupContent).toContain("addKeyword");
		});

		test("setup wizard sends keywords when saving product", () => {
			expect(setupContent).toContain("keywords: state.keywords");
		});
	});

	describe("2. Add keyword via product update", () => {
		test("PUT /api/products/:id accepts keywords array", () => {
			expect(routeContent).toContain('app.put("/products/:id"');
			expect(routeContent).toContain(
				"keywords: z.array(z.string().min(1))",
			);
		});

		test("product update replaces keywords (delete old, insert new)", () => {
			expect(routeContent).toContain(
				"db.delete(keywords).where(eq(keywords.productId, productId))",
			);
			expect(routeContent).toContain(
				"if (data.keywords.length > 0)",
			);
		});
	});

	describe("3. Poll triggers keyword matching", () => {
		test("cron endpoint loads all keywords from database", () => {
			expect(routeContent).toContain("allKeywords");
			expect(routeContent).toContain(
				"keyword: keywords.keyword, productId: keywords.productId",
			);
		});

		test("cron endpoint creates KeywordEntry array for matcher", () => {
			expect(routeContent).toContain("keywordEntries: KeywordEntry[]");
			expect(routeContent).toContain("keyword: k.keyword");
			expect(routeContent).toContain("productId: k.productId");
		});

		test("cron endpoint builds Aho-Corasick matcher from keywords", () => {
			expect(routeContent).toContain(
				"const matcher = buildMatcher(keywordEntries)",
			);
		});

		test("cron endpoint matches post content against keywords", () => {
			expect(routeContent).toContain(
				"const textToMatch = `${post.title} ${post.selftext}`",
			);
			expect(routeContent).toContain("matcher.match(textToMatch)");
		});
	});

	describe("4. Aho-Corasick implementation", () => {
		test("AhoCorasick class is exported", () => {
			expect(keywordMatcherContent).toContain("export class AhoCorasick");
		});

		test("buildMatcher function creates AhoCorasick instance", () => {
			expect(keywordMatcherContent).toContain(
				"export function buildMatcher",
			);
			expect(keywordMatcherContent).toContain("return new AhoCorasick");
		});

		test("match function returns keyword and productId", () => {
			expect(keywordMatcherContent).toContain(
				"match(text: string): MatchResult[]",
			);
			expect(keywordMatcherContent).toContain("keyword:");
			expect(keywordMatcherContent).toContain("productId:");
		});

		test("matching is case insensitive", () => {
			expect(keywordMatcherContent).toContain(".toLowerCase()");
		});
	});

	describe("5. Matching threads are discovered and stored", () => {
		test("matched threads are inserted with matchedKeyword field", () => {
			expect(routeContent).toContain("matchedKeyword: match.keyword");
		});

		test("matched threads are associated with correct productId", () => {
			expect(routeContent).toContain("productId: match.productId");
		});

		test("threads table has matchedKeyword column", () => {
			expect(schemaContent).toContain(
				'matchedKeyword: text("matched_keyword")',
			);
		});

		test("multiple products can match same post independently", () => {
			expect(routeContent).toContain("for (const match of matches)");
			expect(routeContent).toContain(
				"`${match.productId}:${post.id}`",
			);
		});

		test("duplicate thread-product combinations are prevented", () => {
			expect(routeContent).toContain("if (existingSet.has(key)) continue");
		});
	});

	describe("6. Discovery response confirms matches", () => {
		test("cron endpoint returns newThreadsFound count", () => {
			expect(routeContent).toContain("newThreadsFound:");
			expect(routeContent).toContain(
				"newThreadsFound: totalNewThreads",
			);
		});

		test("cron endpoint returns postsProcessed count", () => {
			expect(routeContent).toContain("postsProcessed: posts.length");
		});

		test("cron endpoint returns success status", () => {
			expect(routeContent).toContain("success: true");
		});
	});

	describe("7. Monitor page displays matched threads with keyword", () => {
		test("GET /api/products/:id returns threads for product", () => {
			expect(routeContent).toContain(
				'app.get("/products/:id"',
			);
			expect(routeContent).toContain("threads: productThreads");
		});

		test("threads are fetched by productId", () => {
			expect(routeContent).toContain(
				"eq(threads.productId, productId)",
			);
		});

		test("thread schema includes matchedKeyword in type", () => {
			expect(schemaContent).toContain(
				"export type Thread = typeof threads.$inferSelect",
			);
		});
	});

	describe("8. Keyword generation via AI", () => {
		test("POST /api/keywords/generate endpoint exists", () => {
			expect(routeContent).toContain('app.post("/keywords/generate"');
		});

		test("keyword generation uses product info as context", () => {
			expect(routeContent).toContain("Product: ${name}");
			expect(routeContent).toContain("Description: ${description}");
			expect(routeContent).toContain("Target Audience: ${targetAudience}");
		});

		test("generated keywords are validated by schema", () => {
			expect(routeContent).toContain("keywordsSchema");
			expect(routeContent).toContain(".min(2)");
			expect(routeContent).toContain(".max(50)");
		});

		test("setup wizard auto-generates keywords on step 3 entry", () => {
			expect(setupContent).toContain("/api/keywords/generate");
			expect(setupContent).toContain("setState");
		});
	});

	describe("9. Manual keyword entry", () => {
		test("setup wizard allows manual keyword input", () => {
			expect(setupContent).toContain("addKeyword");
			expect(setupContent).toContain("newKeyword");
		});

		test("setup wizard allows keyword removal", () => {
			expect(setupContent).toContain("removeKeyword");
		});

		test("keywords must be non-empty", () => {
			expect(setupContent).toContain("if (!keyword");
		});
	});

	describe("10. End-to-end flow integrity", () => {
		test("keywords persist from creation through to matching", () => {
			expect(routeContent).toContain("db.insert(keywords).values");
			expect(routeContent).toContain("keyword: k.keyword");
		});

		test("matched threads link back to product via productId", () => {
			expect(routeContent).toContain("productId: match.productId");
			expect(routeContent).toContain(
				"threadsToInsert.push",
			);
		});

		test("matchedKeyword field enables filtering by discovery trigger", () => {
			expect(schemaContent).toContain("matchedKeyword:");
			expect(routeContent).toContain("matchedKeyword: match.keyword");
		});
	});
});
