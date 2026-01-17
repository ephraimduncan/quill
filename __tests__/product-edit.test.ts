import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

const updateProductSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  description: z.string(),
  targetAudience: z.string(),
  keywords: z.array(z.string().min(1)),
});

let existingProducts: Array<{
  id: string;
  userId: string;
  url: string;
  name: string;
  description: string;
  targetAudience: string;
  createdAt: number;
}> = [];

let existingKeywords: Array<{
  id: string;
  productId: string;
  keyword: string;
}> = [];

function createTestApp(authenticated = true, asUser = mockUser) {
  existingProducts = [
    {
      id: "product-1",
      userId: "user-1",
      url: "https://original.com",
      name: "Original Name",
      description: "Original description",
      targetAudience: "Original audience",
      createdAt: 1700000000,
    },
    {
      id: "product-2",
      userId: "user-2",
      url: "https://other.com",
      name: "Other Product",
      description: "Other description",
      targetAudience: "Other audience",
      createdAt: 1700000000,
    },
  ];

  existingKeywords = [
    { id: "kw-1", productId: "product-1", keyword: "original-keyword-1" },
    { id: "kw-2", productId: "product-1", keyword: "original-keyword-2" },
  ];

  const app = new Hono<{ Variables: Variables }>().basePath("/api");

  app.use("*", async (c, next) => {
    if (authenticated) {
      c.set("user", asUser);
      c.set("session", {});
    } else {
      c.set("user", null);
      c.set("session", null);
    }
    return next();
  });

  app.put("/products/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const productId = c.req.param("id");

    const existing = existingProducts.find(
      (p) => p.id === productId && p.userId === user.id
    );

    if (!existing) {
      return c.json({ error: "Product not found" }, 404);
    }

    const body = await c.req.json();
    const parsed = updateProductSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const data = parsed.data;

    existing.url = data.url;
    existing.name = data.name;
    existing.description = data.description;
    existing.targetAudience = data.targetAudience;

    existingKeywords = existingKeywords.filter((k) => k.productId !== productId);

    for (const keyword of data.keywords) {
      existingKeywords.push({
        id: `kw-${Date.now()}-${Math.random()}`,
        productId,
        keyword,
      });
    }

    return c.json({ id: productId });
  });

  app.get("/products/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const productId = c.req.param("id");

    const product = existingProducts.find(
      (p) => p.id === productId && p.userId === user.id
    );

    if (!product) {
      return c.json({ error: "Product not found" }, 404);
    }

    const productKeywords = existingKeywords
      .filter((k) => k.productId === productId)
      .map((k) => k.keyword);

    return c.json({
      ...product,
      keywords: productKeywords,
      threads: [],
    });
  });

  return app;
}

describe("PUT /api/products/:id", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "Updated Name",
        description: "Updated description",
        targetAudience: "Updated audience",
        keywords: ["new-keyword"],
      }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 404 for non-existent product", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/non-existent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "Updated Name",
        description: "",
        targetAudience: "",
        keywords: [],
      }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns 404 for product owned by another user", async () => {
    const app = createTestApp(true, mockUser);
    const res = await app.request("/api/products/product-2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "Updated Name",
        description: "",
        targetAudience: "",
        keywords: [],
      }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("Product not found");
  });

  test("returns 400 for invalid request data", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: "data" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when name is empty", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "",
        description: "",
        targetAudience: "",
        keywords: [],
      }),
    });

    expect(res.status).toBe(400);
  });

  test("returns 400 when URL is invalid", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "not-a-url",
        name: "Updated Name",
        description: "",
        targetAudience: "",
        keywords: [],
      }),
    });

    expect(res.status).toBe(400);
  });

  test("updates product and returns 200 with id", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "Updated Name",
        description: "Updated description",
        targetAudience: "Updated audience",
        keywords: ["new-keyword"],
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("id");
    expect(json.id).toBe("product-1");
  });

  test("updates product info correctly", async () => {
    const app = createTestApp();
    await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://new-url.com",
        name: "New Name",
        description: "New description",
        targetAudience: "New audience",
        keywords: [],
      }),
    });

    const product = existingProducts.find((p) => p.id === "product-1");
    expect(product?.name).toBe("New Name");
    expect(product?.url).toBe("https://new-url.com");
    expect(product?.description).toBe("New description");
    expect(product?.targetAudience).toBe("New audience");
  });

  test("replaces keywords correctly", async () => {
    const app = createTestApp();

    const keywordsBefore = existingKeywords.filter(
      (k) => k.productId === "product-1"
    );
    expect(keywordsBefore.map((k) => k.keyword)).toContain("original-keyword-1");
    expect(keywordsBefore.map((k) => k.keyword)).toContain("original-keyword-2");

    await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "Updated Name",
        description: "",
        targetAudience: "",
        keywords: ["new-kw-1", "new-kw-2", "new-kw-3"],
      }),
    });

    const keywordsAfter = existingKeywords.filter(
      (k) => k.productId === "product-1"
    );
    expect(keywordsAfter).toHaveLength(3);
    expect(keywordsAfter.map((k) => k.keyword)).toContain("new-kw-1");
    expect(keywordsAfter.map((k) => k.keyword)).toContain("new-kw-2");
    expect(keywordsAfter.map((k) => k.keyword)).toContain("new-kw-3");
    expect(keywordsAfter.map((k) => k.keyword)).not.toContain("original-keyword-1");
  });

  test("handles empty keywords array", async () => {
    const app = createTestApp();
    await app.request("/api/products/product-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://updated.com",
        name: "Updated Name",
        description: "",
        targetAudience: "",
        keywords: [],
      }),
    });

    const keywordsAfter = existingKeywords.filter(
      (k) => k.productId === "product-1"
    );
    expect(keywordsAfter).toHaveLength(0);
  });

  test("does not modify other user's products", async () => {
    const app = createTestApp(true, mockUser);

    const originalProduct2 = { ...existingProducts.find((p) => p.id === "product-2")! };

    await app.request("/api/products/product-2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://hacked.com",
        name: "Hacked Name",
        description: "",
        targetAudience: "",
        keywords: [],
      }),
    });

    const product2 = existingProducts.find((p) => p.id === "product-2");
    expect(product2?.name).toBe(originalProduct2.name);
    expect(product2?.url).toBe(originalProduct2.url);
  });
});

describe("GET /api/products/:id (for edit mode)", () => {
  test("returns product with keywords for editing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/products/product-1");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.name).toBe("Original Name");
    expect(json.url).toBe("https://original.com");
    expect(json.keywords).toContain("original-keyword-1");
    expect(json.keywords).toContain("original-keyword-2");
  });
});

describe("updateProductSchema validation", () => {
  test("accepts valid complete data", () => {
    const result = updateProductSchema.safeParse({
      url: "https://example.com",
      name: "Test Product",
      description: "A description",
      targetAudience: "Developers",
      keywords: ["test", "product"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid URL", () => {
    const result = updateProductSchema.safeParse({
      url: "not-a-url",
      name: "Test",
      description: "",
      targetAudience: "",
      keywords: [],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty name", () => {
    const result = updateProductSchema.safeParse({
      url: "https://example.com",
      name: "",
      description: "",
      targetAudience: "",
      keywords: [],
    });
    expect(result.success).toBe(false);
  });

  test("accepts empty description and targetAudience", () => {
    const result = updateProductSchema.safeParse({
      url: "https://example.com",
      name: "Product",
      description: "",
      targetAudience: "",
      keywords: [],
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty keywords array", () => {
    const result = updateProductSchema.safeParse({
      url: "https://example.com",
      name: "Product",
      description: "",
      targetAudience: "",
      keywords: [],
    });
    expect(result.success).toBe(true);
  });
});
