import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

const generateResponseSchema = z.object({
  thread: z.object({
    title: z.string().min(1),
    body: z.string(),
    subreddit: z.string().min(1),
  }),
  product: z.object({
    name: z.string().min(1),
    description: z.string(),
    targetAudience: z.string(),
  }),
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

  app.post("/response/generate", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = generateResponseSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const { thread, product } = parsed.data;

    const mockResponse = `Great question about ${thread.title.toLowerCase().slice(0, 30)}! I've been dealing with similar challenges and found that ${product.name} works really well for this. It ${product.description ? product.description.toLowerCase() : "helps with exactly this kind of problem"}. The community here on r/${thread.subreddit} often recommends various solutions, but I'd suggest giving it a try since it's designed for ${product.targetAudience || "people in your situation"}.`;

    return c.json({ response: mockResponse });
  });

  return app;
}

describe("POST /api/response/generate", () => {
  const validPayload = {
    thread: {
      title: "How do I stay organized with multiple projects?",
      body: "I have 5 different projects at work and I keep losing track of deadlines and tasks. Any recommendations?",
      subreddit: "productivity",
    },
    product: {
      name: "TaskFlow",
      description: "A task management app for busy professionals",
      targetAudience: "Professionals managing multiple projects",
    },
  };

  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 when thread is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: validPayload.product }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when product is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread: validPayload.thread }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when thread title is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread: { ...validPayload.thread, title: "" },
        product: validPayload.product,
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when subreddit is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread: { ...validPayload.thread, subreddit: "" },
        product: validPayload.product,
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when product name is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread: validPayload.thread,
        product: { ...validPayload.product, name: "" },
      }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns response for valid input", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("response");
    expect(typeof json.response).toBe("string");
    expect(json.response.length).toBeGreaterThan(0);
  });

  test("response mentions the product name", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.response).toContain(validPayload.product.name);
  });

  test("response mentions the subreddit", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.response).toContain(validPayload.thread.subreddit);
  });

  test("works with empty thread body", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread: { ...validPayload.thread, body: "" },
        product: validPayload.product,
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("response");
  });

  test("works with empty product description and targetAudience", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        thread: validPayload.thread,
        product: { name: "TaskFlow", description: "", targetAudience: "" },
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("response");
  });
});

describe("response schema validation", () => {
  test("accepts valid input", () => {
    const result = generateResponseSchema.safeParse({
      thread: {
        title: "Test Title",
        body: "Test body content",
        subreddit: "test",
      },
      product: {
        name: "TestProduct",
        description: "A test product",
        targetAudience: "Testers",
      },
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty body", () => {
    const result = generateResponseSchema.safeParse({
      thread: {
        title: "Test Title",
        body: "",
        subreddit: "test",
      },
      product: {
        name: "TestProduct",
        description: "",
        targetAudience: "",
      },
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing thread title", () => {
    const result = generateResponseSchema.safeParse({
      thread: {
        title: "",
        body: "content",
        subreddit: "test",
      },
      product: {
        name: "TestProduct",
        description: "",
        targetAudience: "",
      },
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing product name", () => {
    const result = generateResponseSchema.safeParse({
      thread: {
        title: "Title",
        body: "content",
        subreddit: "test",
      },
      product: {
        name: "",
        description: "desc",
        targetAudience: "audience",
      },
    });
    expect(result.success).toBe(false);
  });
});
