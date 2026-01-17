import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const client = createClient({ url: ":memory:" });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await client.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      reddit_id TEXT NOT NULL UNIQUE,
      reddit_username TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      url TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      target_audience TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE keywords (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE threads (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      reddit_thread_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body_preview TEXT NOT NULL,
      subreddit TEXT NOT NULL,
      url TEXT NOT NULL,
      created_utc INTEGER NOT NULL,
      discovered_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_new INTEGER NOT NULL DEFAULT 1
    )
  `);

  await client.execute(`
    CREATE TABLE post_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      thread_id TEXT NOT NULL REFERENCES threads(id),
      response_snippet TEXT NOT NULL,
      reddit_comment_url TEXT NOT NULL,
      posted_at INTEGER NOT NULL
    )
  `);
});

afterAll(() => {
  client.close();
});

describe("Database Schema", () => {
  test("can insert and query users", async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.users).values({
      id: userId,
      redditId: "reddit_123",
      redditUsername: "testuser",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      tokenExpiresAt: now + 3600000,
      createdAt: now,
    });

    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    expect(users).toHaveLength(1);
    expect(users[0].redditUsername).toBe("testuser");
    expect(users[0].redditId).toBe("reddit_123");
  });

  test("can insert and query products with foreign key to users", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.users).values({
      id: userId,
      redditId: "reddit_456",
      redditUsername: "productowner",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      tokenExpiresAt: now + 3600000,
      createdAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "Test Product",
      description: "A test product description",
      targetAudience: "Developers",
      createdAt: now,
    });

    const products = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, productId));

    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Test Product");
    expect(products[0].userId).toBe(userId);
  });

  test("can insert and query keywords for a product", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const keywordId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.users).values({
      id: userId,
      redditId: "reddit_789",
      redditUsername: "keyworduser",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      tokenExpiresAt: now + 3600000,
      createdAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "Keyword Product",
      description: "Description",
      targetAudience: "Users",
      createdAt: now,
    });

    await db.insert(schema.keywords).values({
      id: keywordId,
      productId: productId,
      keyword: "test keyword",
    });

    const keywords = await db
      .select()
      .from(schema.keywords)
      .where(eq(schema.keywords.productId, productId));

    expect(keywords).toHaveLength(1);
    expect(keywords[0].keyword).toBe("test keyword");
  });

  test("can insert and query threads with default values", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const threadId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.users).values({
      id: userId,
      redditId: "reddit_thread_user",
      redditUsername: "threaduser",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      tokenExpiresAt: now + 3600000,
      createdAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "Thread Product",
      description: "Description",
      targetAudience: "Users",
      createdAt: now,
    });

    await db.insert(schema.threads).values({
      id: threadId,
      productId: productId,
      redditThreadId: "abc123",
      title: "Test Thread",
      bodyPreview: "Thread body preview...",
      subreddit: "test",
      url: "https://reddit.com/r/test/abc123",
      createdUtc: now,
      discoveredAt: now,
    });

    const threads = await db
      .select()
      .from(schema.threads)
      .where(eq(schema.threads.id, threadId));

    expect(threads).toHaveLength(1);
    expect(threads[0].title).toBe("Test Thread");
    expect(threads[0].status).toBe("active");
    expect(threads[0].isNew).toBe(true);
  });

  test("can insert and query post history", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const threadId = crypto.randomUUID();
    const historyId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(schema.users).values({
      id: userId,
      redditId: "reddit_history_user",
      redditUsername: "historyuser",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      tokenExpiresAt: now + 3600000,
      createdAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "History Product",
      description: "Description",
      targetAudience: "Users",
      createdAt: now,
    });

    await db.insert(schema.threads).values({
      id: threadId,
      productId: productId,
      redditThreadId: "def456",
      title: "History Thread",
      bodyPreview: "Body preview...",
      subreddit: "test",
      url: "https://reddit.com/r/test/def456",
      createdUtc: now,
      discoveredAt: now,
    });

    await db.insert(schema.postHistory).values({
      id: historyId,
      userId: userId,
      productId: productId,
      threadId: threadId,
      responseSnippet: "This is my response snippet...",
      redditCommentUrl: "https://reddit.com/r/test/comments/def456/comment/xyz",
      postedAt: now,
    });

    const history = await db
      .select()
      .from(schema.postHistory)
      .where(eq(schema.postHistory.id, historyId));

    expect(history).toHaveLength(1);
    expect(history[0].responseSnippet).toBe("This is my response snippet...");
    expect(history[0].userId).toBe(userId);
  });

  test("schema exports correct types", () => {
    const user: schema.NewUser = {
      id: "test",
      redditId: "reddit_id",
      redditUsername: "username",
      accessToken: "token",
      refreshToken: "refresh",
      tokenExpiresAt: Date.now(),
      createdAt: Date.now(),
    };

    const product: schema.NewProduct = {
      id: "test",
      userId: "user_id",
      url: "https://example.com",
      name: "Product",
      description: "Description",
      targetAudience: "Audience",
      createdAt: Date.now(),
    };

    expect(user.redditUsername).toBe("username");
    expect(product.name).toBe("Product");
  });
});
