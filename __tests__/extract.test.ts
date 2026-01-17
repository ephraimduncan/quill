import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

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

  app.post("/extract", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return c.json({ error: "URL is required" }, 400);
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid URL format" }, 400);
    }

    return c.json({
      name: "Test Product",
      description: "A test product description",
      targetAudience: "Developers who need testing tools",
      url: parsedUrl.toString(),
    });
  });

  return app;
}

describe("POST /api/extract", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTestApp(false);
    const res = await app.request("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 when URL is missing", async () => {
    const app = createTestApp();
    const res = await app.request("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("URL is required");
  });

  test("returns 400 when URL is not a string", async () => {
    const app = createTestApp();
    const res = await app.request("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: 123 }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("URL is required");
  });

  test("returns 400 for invalid URL format", async () => {
    const app = createTestApp();
    const res = await app.request("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid URL format");
  });

  test("returns extracted product info for valid URL", async () => {
    const app = createTestApp();
    const res = await app.request("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/product" }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty("name");
    expect(json).toHaveProperty("description");
    expect(json).toHaveProperty("targetAudience");
    expect(json).toHaveProperty("url");
    expect(json.url).toBe("https://example.com/product");
  });
});

describe("jsdom + Readability integration", () => {
  test("parses HTML and extracts content with Readability", () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>My Product</title></head>
        <body>
          <article>
            <h1>Product Name</h1>
            <p>This is a great product that helps developers build better software.</p>
            <p>It's designed for teams who want to ship faster.</p>
          </article>
        </body>
      </html>
    `;

    const dom = new JSDOM(html, { url: "https://example.com" });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    expect(article).not.toBeNull();
    expect(article!.title).toBe("My Product");
    expect(article!.textContent).toContain("Product Name");
    expect(article!.textContent).toContain("great product");
  });

  test("returns null for empty HTML", () => {
    const html = `<!DOCTYPE html><html><head></head><body></body></html>`;

    const dom = new JSDOM(html, { url: "https://example.com" });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    expect(article).toBeNull();
  });
});
