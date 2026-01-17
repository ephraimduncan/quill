import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

const postResponseSchema = z.object({
  threadId: z.string().min(1),
  redditThreadId: z.string().min(1),
  productId: z.string().min(1),
  response: z.string().min(1),
});

type MockAccount = {
  userId: string;
  providerId: string;
  accessToken: string | null;
};

type MockRedditResponse = {
  json: {
    errors: string[][];
    data?: {
      things: { data: { id: string; permalink: string } }[];
    };
  };
};

function createTestApp(options: {
  authenticated?: boolean;
  account?: MockAccount | null;
  redditResponse?: MockRedditResponse;
  redditError?: boolean;
} = {}) {
  const {
    authenticated = true,
    account = { userId: "user-1", providerId: "reddit", accessToken: "valid-token" },
    redditResponse = {
      json: {
        errors: [],
        data: {
          things: [{ data: { id: "comment123", permalink: "/r/test/comments/abc123/title/comment123" } }],
        },
      },
    },
    redditError = false,
  } = options;

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

  app.post("/response/post", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = postResponseSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    if (!account || account.userId !== user.id || account.providerId !== "reddit") {
      return c.json({ error: "Reddit account not connected" }, 401);
    }

    if (!account.accessToken) {
      return c.json({ error: "Reddit account not connected" }, 401);
    }

    if (redditError) {
      return c.json({ error: "Failed to post to Reddit: Network error" }, 500);
    }

    if (redditResponse.json.errors.length > 0) {
      const [errorCode, errorMessage] = redditResponse.json.errors[0];
      return c.json({ error: errorMessage || errorCode }, 400);
    }

    const commentData = redditResponse.json.data?.things?.[0]?.data;
    const commentUrl = commentData?.permalink
      ? `https://reddit.com${commentData.permalink}`
      : null;

    return c.json({ success: true, commentUrl });
  });

  return app;
}

describe("POST /api/response/post", () => {
  const validPayload = {
    threadId: "thread-123",
    redditThreadId: "abc123",
    productId: "product-456",
    response: "This is a helpful response about the topic.",
  };

  test("returns 401 when not authenticated", async () => {
    const app = createTestApp({ authenticated: false });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns 400 when threadId is missing", async () => {
    const app = createTestApp();
    const { threadId: _threadId, ...payload } = validPayload;
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
    void _threadId;
  });

  test("returns 400 when redditThreadId is missing", async () => {
    const app = createTestApp();
    const { redditThreadId: _redditThreadId, ...payload } = validPayload;
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
    void _redditThreadId;
  });

  test("returns 400 when productId is missing", async () => {
    const app = createTestApp();
    const { productId: _productId, ...payload } = validPayload;
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
    void _productId;
  });

  test("returns 400 when response is missing", async () => {
    const app = createTestApp();
    const { response: _response, ...payload } = validPayload;
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    void _response;

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 400 when response is empty", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validPayload, response: "" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid request data");
  });

  test("returns 401 when Reddit account not connected", async () => {
    const app = createTestApp({ account: null });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Reddit account not connected");
  });

  test("returns 401 when access token is null", async () => {
    const app = createTestApp({
      account: { userId: "user-1", providerId: "reddit", accessToken: null },
    });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Reddit account not connected");
  });

  test("returns success with commentUrl for valid post", async () => {
    const app = createTestApp();
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.commentUrl).toBe(
      "https://reddit.com/r/test/comments/abc123/title/comment123"
    );
  });

  test("returns Reddit error message for locked thread", async () => {
    const app = createTestApp({
      redditResponse: {
        json: {
          errors: [["THREAD_LOCKED", "This thread is locked", "parent"]],
        },
      },
    });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("This thread is locked");
  });

  test("returns Reddit error message for archived thread", async () => {
    const app = createTestApp({
      redditResponse: {
        json: {
          errors: [["TOO_OLD", "That post is archived and can't be commented on", "parent"]],
        },
      },
    });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("That post is archived and can't be commented on");
  });

  test("returns Reddit error message for deleted post", async () => {
    const app = createTestApp({
      redditResponse: {
        json: {
          errors: [["DELETED_LINK", "That post has been deleted", "parent"]],
        },
      },
    });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("That post has been deleted");
  });

  test("returns error code when error message is empty", async () => {
    const app = createTestApp({
      redditResponse: {
        json: {
          errors: [["UNKNOWN_ERROR", "", "parent"]],
        },
      },
    });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("UNKNOWN_ERROR");
  });

  test("returns 500 when Reddit API fails", async () => {
    const app = createTestApp({ redditError: true });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("Failed to post to Reddit");
  });

  test("handles missing permalink in response", async () => {
    const app = createTestApp({
      redditResponse: {
        json: {
          errors: [],
          data: {
            things: [{ data: { id: "comment123", permalink: "" } }],
          },
        },
      },
    });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.commentUrl).toBeNull();
  });
});

describe("post response schema validation", () => {
  test("accepts valid input", () => {
    const result = postResponseSchema.safeParse({
      threadId: "thread-123",
      redditThreadId: "abc123",
      productId: "product-456",
      response: "A response",
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty threadId", () => {
    const result = postResponseSchema.safeParse({
      threadId: "",
      redditThreadId: "abc123",
      productId: "product-456",
      response: "A response",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty redditThreadId", () => {
    const result = postResponseSchema.safeParse({
      threadId: "thread-123",
      redditThreadId: "",
      productId: "product-456",
      response: "A response",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty productId", () => {
    const result = postResponseSchema.safeParse({
      threadId: "thread-123",
      redditThreadId: "abc123",
      productId: "",
      response: "A response",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty response", () => {
    const result = postResponseSchema.safeParse({
      threadId: "thread-123",
      redditThreadId: "abc123",
      productId: "product-456",
      response: "",
    });
    expect(result.success).toBe(false);
  });
});
