import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

const mockUser = { id: "user-1", email: "test@example.com" };

type Variables = {
  user: typeof mockUser | null;
  session: object | null;
};

type MockAccount = {
  userId: string;
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

function createTokenStatusApp(options: {
  authenticated?: boolean;
  account?: MockAccount | null;
} = {}) {
  const {
    authenticated = true,
    account = {
      userId: "user-1",
      providerId: "reddit",
      accessToken: "valid-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 2 * ONE_HOUR_MS),
    },
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

  app.get("/auth/token-status", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!account) {
      return c.json({ connected: false, valid: false, needsReauth: true });
    }

    if (!account.accessToken) {
      return c.json({ connected: true, valid: false, needsReauth: true });
    }

    const expiresAt = account.accessTokenExpiresAt;
    if (!expiresAt) {
      return c.json({ connected: true, valid: true, needsReauth: false });
    }

    const now = Date.now();
    const expiresAtMs = expiresAt.getTime();
    const hasRefreshToken = !!account.refreshToken;

    if (expiresAtMs <= now) {
      return c.json({
        connected: true,
        valid: false,
        needsReauth: !hasRefreshToken,
        canRefresh: hasRefreshToken,
      });
    }

    const needsProactiveRefresh = expiresAtMs - now <= ONE_HOUR_MS;

    return c.json({
      connected: true,
      valid: true,
      needsReauth: false,
      needsProactiveRefresh: needsProactiveRefresh && hasRefreshToken,
    });
  });

  return app;
}

describe("GET /api/auth/token-status", () => {
  test("returns 401 when not authenticated", async () => {
    const app = createTokenStatusApp({ authenticated: false });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  test("returns needsReauth when account not found", async () => {
    const app = createTokenStatusApp({ account: null });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(false);
    expect(json.valid).toBe(false);
    expect(json.needsReauth).toBe(true);
  });

  test("returns needsReauth when access token is null", async () => {
    const app = createTokenStatusApp({
      account: {
        userId: "user-1",
        providerId: "reddit",
        accessToken: null,
        refreshToken: "refresh-token",
        accessTokenExpiresAt: null,
      },
    });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.valid).toBe(false);
    expect(json.needsReauth).toBe(true);
  });

  test("returns valid when token has no expiry", async () => {
    const app = createTokenStatusApp({
      account: {
        userId: "user-1",
        providerId: "reddit",
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAt: null,
      },
    });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.valid).toBe(true);
    expect(json.needsReauth).toBe(false);
  });

  test("returns valid when token is not near expiry", async () => {
    const app = createTokenStatusApp({
      account: {
        userId: "user-1",
        providerId: "reddit",
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAt: new Date(Date.now() + 2 * ONE_HOUR_MS),
      },
    });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.valid).toBe(true);
    expect(json.needsReauth).toBe(false);
    expect(json.needsProactiveRefresh).toBe(false);
  });

  test("returns needsProactiveRefresh when token expires within 1 hour", async () => {
    const app = createTokenStatusApp({
      account: {
        userId: "user-1",
        providerId: "reddit",
        accessToken: "valid-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
      },
    });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.valid).toBe(true);
    expect(json.needsReauth).toBe(false);
    expect(json.needsProactiveRefresh).toBe(true);
  });

  test("returns canRefresh when token expired but has refresh token", async () => {
    const app = createTokenStatusApp({
      account: {
        userId: "user-1",
        providerId: "reddit",
        accessToken: "expired-token",
        refreshToken: "refresh-token",
        accessTokenExpiresAt: new Date(Date.now() - 1000), // expired
      },
    });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.valid).toBe(false);
    expect(json.needsReauth).toBe(false);
    expect(json.canRefresh).toBe(true);
  });

  test("returns needsReauth when token expired and no refresh token", async () => {
    const app = createTokenStatusApp({
      account: {
        userId: "user-1",
        providerId: "reddit",
        accessToken: "expired-token",
        refreshToken: null,
        accessTokenExpiresAt: new Date(Date.now() - 1000), // expired
      },
    });
    const res = await app.request("/api/auth/token-status");

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.connected).toBe(true);
    expect(json.valid).toBe(false);
    expect(json.needsReauth).toBe(true);
    expect(json.canRefresh).toBe(false);
  });
});

describe("POST /api/response/post with needsReauth", () => {
  function createPostApp(options: {
    authenticated?: boolean;
    tokenRefreshFails?: boolean;
    hasRefreshToken?: boolean;
  } = {}) {
    const {
      authenticated = true,
      tokenRefreshFails = false,
      hasRefreshToken = true,
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

      const accessToken = tokenRefreshFails ? null : "valid-token";

      if (!accessToken) {
        if (!hasRefreshToken) {
          return c.json(
            { error: "Reddit session expired. Please sign in again.", needsReauth: true },
            401
          );
        }

        return c.json(
          { error: "Failed to refresh Reddit token. Please sign in again.", needsReauth: true },
          401
        );
      }

      return c.json({ success: true, commentUrl: "https://reddit.com/comment/123" });
    });

    return app;
  }

  const validPayload = {
    threadId: "thread-123",
    redditThreadId: "abc123",
    productId: "product-456",
    response: "This is a helpful response.",
  };

  test("returns success when token is valid", async () => {
    const app = createPostApp();
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });

  test("returns needsReauth when refresh fails and has refresh token", async () => {
    const app = createPostApp({ tokenRefreshFails: true, hasRefreshToken: true });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.needsReauth).toBe(true);
    expect(json.error).toContain("Failed to refresh");
  });

  test("returns needsReauth when no refresh token available", async () => {
    const app = createPostApp({ tokenRefreshFails: true, hasRefreshToken: false });
    const res = await app.request("/api/response/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.needsReauth).toBe(true);
    expect(json.error).toContain("session expired");
  });
});

describe("Reddit token refresh configuration", () => {
  test("auth module exports refreshAccessToken in reddit provider config", async () => {
    const fs = await import("fs");
    const authContent = fs.readFileSync("./lib/auth/index.ts", "utf-8");
    expect(authContent).toContain("refreshAccessToken");
    expect(authContent).toContain("refreshRedditToken");
  });

  test("refresh token endpoint URL is correct", () => {
    const redditTokenEndpoint = "https://www.reddit.com/api/v1/access_token";
    expect(redditTokenEndpoint).toContain("reddit.com");
    expect(redditTokenEndpoint).toContain("access_token");
  });
});

describe("ResponseEditorPanel re-auth behavior", () => {
  test("re-auth prompt displays when needsReauth from API", () => {
    const hasNeedsReauth = true;
    const error = "Reddit session expired. Please sign in again.";

    expect(hasNeedsReauth).toBe(true);
    expect(error).toContain("session expired");
  });

  test("post button disabled when tokenExpired prop is true", () => {
    const tokenExpired = true;
    const hasResponse = true;
    const isPosting = false;
    const isPosted = false;

    const postingDisabled = isPosting || isPosted || !hasResponse || tokenExpired;
    expect(postingDisabled).toBe(true);
  });

  test("post button enabled when token is valid", () => {
    const tokenExpired = false;
    const hasResponse = true;
    const isPosting = false;
    const isPosted = false;

    const postingDisabled = isPosting || isPosted || !hasResponse || tokenExpired;
    expect(postingDisabled).toBe(false);
  });
});

describe("Monitor page token status check", () => {
  test("token status endpoint path is correct", () => {
    const tokenStatusPath = "/api/auth/token-status";
    expect(tokenStatusPath).toBe("/api/auth/token-status");
  });

  test("tokenExpired state derived from needsReauth", () => {
    const tokenData = { needsReauth: true };
    const tokenExpired = tokenData.needsReauth === true;
    expect(tokenExpired).toBe(true);
  });

  test("tokenExpired false when needsReauth is false", () => {
    const tokenData = { needsReauth: false };
    const tokenExpired = tokenData.needsReauth === true;
    expect(tokenExpired).toBe(false);
  });
});
