import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, count, and } from "drizzle-orm";
import * as schema from "../lib/db/schema";

const client = createClient({ url: ":memory:" });
const db = drizzle(client, { schema });

type Variables = {
  user: { id: string; name: string; email: string } | null;
  session: { id: string } | null;
};

function createTestApp(mockUser: Variables["user"] = null) {
  const app = new Hono<{ Variables: Variables }>().basePath("/api");

  app.use("*", async (c, next) => {
    c.set("user", mockUser);
    c.set("session", mockUser ? { id: "session_123" } : null);
    return next();
  });

  app.get("/products", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userProducts = await db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        url: schema.products.url,
        createdAt: schema.products.createdAt,
        newThreadCount: count(schema.threads.id),
      })
      .from(schema.products)
      .leftJoin(
        schema.threads,
        and(
          eq(schema.products.id, schema.threads.productId),
          eq(schema.threads.isNew, true),
          eq(schema.threads.status, "active")
        )
      )
      .where(eq(schema.products.userId, user.id))
      .groupBy(schema.products.id);

    return c.json(userProducts);
  });

  return app;
}

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
});

afterAll(() => {
  client.close();
});

describe("GET /api/products", () => {
  test("returns 401 for unauthenticated requests", async () => {
    const app = createTestApp(null);
    const res = await app.request("/api/products");

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns empty array when user has no products", async () => {
    const userId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "emptyuser",
      email: "empty@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const app = createTestApp({
      id: userId,
      name: "emptyuser",
      email: "empty@example.com",
    });

    const res = await app.request("/api/products");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual([]);
  });

  test("returns products with newThreadCount for authenticated user", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "productuser",
      email: "products@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://myproduct.com",
      name: "My Product",
      description: "Product description",
      targetAudience: "Developers",
      createdAt: Date.now(),
    });

    const app = createTestApp({
      id: userId,
      name: "productuser",
      email: "products@example.com",
    });

    const res = await app.request("/api/products");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("My Product");
    expect(json[0].url).toBe("https://myproduct.com");
    expect(json[0].newThreadCount).toBe(0);
  });

  test("counts only new active threads", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values({
      id: userId,
      name: "threadcountuser",
      email: "threadcount@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schema.products).values({
      id: productId,
      userId: userId,
      url: "https://threadcount.com",
      name: "Thread Count Product",
      description: "Description",
      targetAudience: "Users",
      createdAt: Date.now(),
    });

    // Insert 3 new active threads
    for (let i = 0; i < 3; i++) {
      await db.insert(schema.threads).values({
        id: crypto.randomUUID(),
        productId: productId,
        redditThreadId: `new_active_${i}`,
        title: `New Active Thread ${i}`,
        bodyPreview: "Preview...",
        subreddit: "test",
        url: `https://reddit.com/r/test/${i}`,
        createdUtc: Date.now(),
        discoveredAt: Date.now(),
        status: "active",
        isNew: true,
      });
    }

    // Insert 1 dismissed thread (should not count)
    await db.insert(schema.threads).values({
      id: crypto.randomUUID(),
      productId: productId,
      redditThreadId: "dismissed",
      title: "Dismissed Thread",
      bodyPreview: "Preview...",
      subreddit: "test",
      url: "https://reddit.com/r/test/dismissed",
      createdUtc: Date.now(),
      discoveredAt: Date.now(),
      status: "dismissed",
      isNew: true,
    });

    // Insert 1 viewed thread (should not count)
    await db.insert(schema.threads).values({
      id: crypto.randomUUID(),
      productId: productId,
      redditThreadId: "viewed",
      title: "Viewed Thread",
      bodyPreview: "Preview...",
      subreddit: "test",
      url: "https://reddit.com/r/test/viewed",
      createdUtc: Date.now(),
      discoveredAt: Date.now(),
      status: "active",
      isNew: false,
    });

    const app = createTestApp({
      id: userId,
      name: "threadcountuser",
      email: "threadcount@example.com",
    });

    const res = await app.request("/api/products");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].newThreadCount).toBe(3);
  });

  test("does not return other users products", async () => {
    const userId1 = crypto.randomUUID();
    const userId2 = crypto.randomUUID();
    const now = new Date();

    await db.insert(schema.user).values([
      {
        id: userId1,
        name: "user1",
        email: "user1@example.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userId2,
        name: "user2",
        email: "user2@example.com",
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await db.insert(schema.products).values([
      {
        id: crypto.randomUUID(),
        userId: userId1,
        url: "https://user1product.com",
        name: "User 1 Product",
        description: "Description",
        targetAudience: "Users",
        createdAt: Date.now(),
      },
      {
        id: crypto.randomUUID(),
        userId: userId2,
        url: "https://user2product.com",
        name: "User 2 Product",
        description: "Description",
        targetAudience: "Users",
        createdAt: Date.now(),
      },
    ]);

    const app = createTestApp({
      id: userId1,
      name: "user1",
      email: "user1@example.com",
    });

    const res = await app.request("/api/products");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].name).toBe("User 1 Product");
  });
});

describe("ProductCard component", () => {
  test("ProductCard module exports correctly", async () => {
    const mod = await import("../components/product-card");
    expect(typeof mod.ProductCard).toBe("function");
  });
});
