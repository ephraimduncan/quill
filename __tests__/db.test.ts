import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const client = createClient({ url: ":memory:" });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await client.execute(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL,
      image TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE account (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      id_token TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    )
  `);

  await client.execute(`
    CREATE TABLE products (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id),
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
      is_new INTEGER NOT NULL DEFAULT 1,
      matched_keyword TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE reddit_sync_state (
      id TEXT PRIMARY KEY DEFAULT 'global',
      last_post_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

});

afterAll(() => {
  client.close();
});

describe("Database Schema", () => {
  test("can insert and query users", async () => {
    const userId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "testuser",
      email: "test@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const users = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, userId));

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe("testuser");
    expect(users[0].email).toBe("test@example.com");
  });

  test("can insert and query accounts for OAuth", async () => {
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "oauthuser",
      email: "oauth@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.account).values({
      id: accountId,
      userId: userId,
      accountId: "reddit_123",
      providerId: "reddit",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: new Date(now.getTime() + 3600000),
      scope: "identity read submit",
      createdAt: now,
      updatedAt: now,
    });

    const accounts = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, userId));

    expect(accounts).toHaveLength(1);
    expect(accounts[0].providerId).toBe("reddit");
    expect(accounts[0].accountId).toBe("reddit_123");
    expect(accounts[0].scope).toBe("identity read submit");
  });

  test("can insert and query products with foreign key to users", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "productowner",
      email: "product@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "Test Product",
      description: "A test product description",
      targetAudience: "Developers",
      createdAt: Date.now(),
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
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "keyworduser",
      email: "keyword@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "Keyword Product",
      description: "Description",
      targetAudience: "Users",
      createdAt: Date.now(),
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
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "threaduser",
      email: "thread@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "Thread Product",
      description: "Description",
      targetAudience: "Users",
      createdAt: Date.now(),
    });

    await db.insert(schema.threads).values({
      id: threadId,
      productId: productId,
      redditThreadId: "abc123",
      title: "Test Thread",
      bodyPreview: "Thread body preview...",
      subreddit: "test",
      url: "https://reddit.com/r/test/abc123",
      createdUtc: Date.now(),
      discoveredAt: Date.now(),
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

  test("schema exports correct types", () => {
    const userObj: schema.NewUser = {
      id: "test",
      name: "username",
      email: "email@example.com",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
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

    expect(userObj.name).toBe("username");
    expect(product.name).toBe("Product");
  });
});
