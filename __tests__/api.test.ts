import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { handle } from "hono/vercel";

const app = new Hono().basePath("/api");

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

describe("Hono API", () => {
  test("GET /api/health returns ok status", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toEqual({ status: "ok" });
  });

  test("returns 404 for unknown routes", async () => {
    const res = await app.request("/api/unknown");
    expect(res.status).toBe(404);
  });

  test("handle function returns valid handlers", () => {
    const handler = handle(app);
    expect(typeof handler).toBe("function");
  });
});
