import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

const keywordsSchema = z.object({
  keywords: z
    .array(
      z
        .string()
        .min(2)
        .max(50)
        .regex(/^[a-zA-Z0-9\s-]+$/)
    )
    .min(1)
    .max(15),
});

function createTestApp(authenticated = true) {
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

  app.post("/keywords/generate", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { name } = body;

    if (!name || typeof name !== "string") {
      return c.json({ error: "Product name is required" }, 400);
    }

    const mockKeywords = [
      "productivity tools",
      "how to stay organized",
      "best task manager",
      "project management help",
      "team collaboration software",
    ];

    return c.json({ keywords: mockKeywords });
  });

  return app;
}

describe("POST /api/keywords/generate", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/keywords/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Product" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 when product name is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/keywords/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Product name is required");
  });

  test("returns 400 when product name is not a string", async () => {
    const app = createTestApp();
    const res = await app.request("/api/keywords/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: 123 }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Product name is required");
  });

  test("returns keywords array for valid input", async () => {
    const app = createTestApp();
    const res = await app.request("/api/keywords/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "TaskFlow",
        description: "A task management app",
        targetAudience: "Busy professionals",
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("keywords");
    expect(Array.isArray(json.keywords)).toBe(true);
    expect(json.keywords.length).toBeGreaterThan(0);
  });

  test("works with only product name", async () => {
    const app = createTestApp();
    const res = await app.request("/api/keywords/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "TaskFlow" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("keywords");
  });
});

describe("keywords schema validation", () => {
  test("accepts valid keywords", () => {
    const result = keywordsSchema.safeParse({
      keywords: ["productivity tools", "task manager", "how to organize"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty keywords array", () => {
    const result = keywordsSchema.safeParse({ keywords: [] });
    expect(result.success).toBe(false);
  });

  test("rejects keywords with special characters", () => {
    const result = keywordsSchema.safeParse({
      keywords: ["valid keyword", "invalid@keyword!"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects keywords that are too short", () => {
    const result = keywordsSchema.safeParse({
      keywords: ["a"],
    });
    expect(result.success).toBe(false);
  });

  test("accepts hyphenated keywords", () => {
    const result = keywordsSchema.safeParse({
      keywords: ["self-improvement", "time-management"],
    });
    expect(result.success).toBe(true);
  });
});
