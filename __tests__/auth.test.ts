import { describe, expect, test } from "bun:test";
import * as authSchema from "../lib/auth/schema";

describe("Auth Schema", () => {
  test("user table has required columns", () => {
    const columns = Object.keys(authSchema.user);
    expect(columns).toContain("id");
    expect(columns).toContain("name");
    expect(columns).toContain("email");
    expect(columns).toContain("emailVerified");
    expect(columns).toContain("image");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
  });

  test("session table has required columns", () => {
    const columns = Object.keys(authSchema.session);
    expect(columns).toContain("id");
    expect(columns).toContain("userId");
    expect(columns).toContain("token");
    expect(columns).toContain("expiresAt");
    expect(columns).toContain("ipAddress");
    expect(columns).toContain("userAgent");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
  });

  test("account table has OAuth token columns", () => {
    const columns = Object.keys(authSchema.account);
    expect(columns).toContain("id");
    expect(columns).toContain("userId");
    expect(columns).toContain("accountId");
    expect(columns).toContain("providerId");
    expect(columns).toContain("accessToken");
    expect(columns).toContain("refreshToken");
    expect(columns).toContain("accessTokenExpiresAt");
    expect(columns).toContain("scope");
    expect(columns).toContain("createdAt");
    expect(columns).toContain("updatedAt");
  });

  test("verification table has required columns", () => {
    const columns = Object.keys(authSchema.verification);
    expect(columns).toContain("id");
    expect(columns).toContain("identifier");
    expect(columns).toContain("value");
    expect(columns).toContain("expiresAt");
  });
});

describe("Auth Client", () => {
  test("exports signIn, signOut, useSession", async () => {
    const { signIn, signOut, useSession } = await import("../lib/auth/client");
    expect(signIn).toBeDefined();
    expect(signOut).toBeDefined();
    expect(useSession).toBeDefined();
  });

  test("authClient is properly configured", async () => {
    const { authClient } = await import("../lib/auth/client");
    expect(authClient).toBeDefined();
    expect(authClient.signIn).toBeDefined();
    expect(authClient.signOut).toBeDefined();
  });
});
