import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import * as authSchema from "../lib/auth/schema";
import * as dbSchema from "../lib/db/schema";

const client = createClient({ url: ":memory:" });
const db = drizzle(client, { schema: { ...authSchema, ...dbSchema } });

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
});

afterAll(() => {
  client.close();
});

describe("Auth Flow Verification: Sign up → Login → Access Dashboard", () => {
  describe("1. Signup Implementation", () => {
    test("auth config has email/password enabled", () => {
      const authPath = path.join(process.cwd(), "lib/auth/index.ts");
      const content = fs.readFileSync(authPath, "utf-8");
      expect(content).toContain("emailAndPassword");
      expect(content).toContain("enabled: true");
    });

    test("signup page exists and has required form fields", () => {
      const signupPath = path.join(process.cwd(), "app/(auth)/signup/page.tsx");
      const content = fs.readFileSync(signupPath, "utf-8");
      expect(content).toContain('type="email"');
      expect(content).toContain('type="password"');
      expect(content).toContain('id="name"');
      expect(content).toContain("signUp.email");
    });

    test("signup calls better-auth signUp.email API", () => {
      const signupPath = path.join(process.cwd(), "app/(auth)/signup/page.tsx");
      const content = fs.readFileSync(signupPath, "utf-8");
      expect(content).toContain("signUp.email({");
      expect(content).toContain("email,");
      expect(content).toContain("password,");
      expect(content).toContain("name,");
    });

    test("signup redirects to dashboard on success", () => {
      const signupPath = path.join(process.cwd(), "app/(auth)/signup/page.tsx");
      const content = fs.readFileSync(signupPath, "utf-8");
      expect(content).toContain('router.push("/dashboard")');
    });

    test("auth client exports signUp method", async () => {
      const { signUp } = await import("../lib/auth/client");
      expect(signUp).toBeDefined();
      expect(signUp.email).toBeDefined();
      expect(typeof signUp.email).toBe("function");
    });
  });

  describe("2. Login Implementation", () => {
    test("login page exists and has required form fields", () => {
      const loginPath = path.join(process.cwd(), "app/(auth)/login/page.tsx");
      const content = fs.readFileSync(loginPath, "utf-8");
      expect(content).toContain('type="email"');
      expect(content).toContain('type="password"');
      expect(content).toContain("signIn.email");
    });

    test("login calls better-auth signIn.email API", () => {
      const loginPath = path.join(process.cwd(), "app/(auth)/login/page.tsx");
      const content = fs.readFileSync(loginPath, "utf-8");
      expect(content).toContain("signIn.email({");
      expect(content).toContain("email,");
      expect(content).toContain("password,");
    });

    test("login redirects to dashboard on success", () => {
      const loginPath = path.join(process.cwd(), "app/(auth)/login/page.tsx");
      const content = fs.readFileSync(loginPath, "utf-8");
      expect(content).toContain('router.push("/dashboard")');
    });

    test("auth client exports signIn method", async () => {
      const { signIn } = await import("../lib/auth/client");
      expect(signIn).toBeDefined();
      expect(signIn.email).toBeDefined();
      expect(typeof signIn.email).toBe("function");
    });
  });

  describe("3. Dashboard Access", () => {
    test("dashboard page exists", () => {
      const dashboardPath = path.join(
        process.cwd(),
        "app/(app)/dashboard/page.tsx"
      );
      expect(fs.existsSync(dashboardPath)).toBe(true);
    });

    test("dashboard fetches products from authenticated API", () => {
      const dashboardPath = path.join(
        process.cwd(),
        "app/(app)/dashboard/page.tsx"
      );
      const content = fs.readFileSync(dashboardPath, "utf-8");
      expect(content).toContain('fetch("/api/products")');
    });

    test("dashboard handles 401 unauthorized response", () => {
      const dashboardPath = path.join(
        process.cwd(),
        "app/(app)/dashboard/page.tsx"
      );
      const content = fs.readFileSync(dashboardPath, "utf-8");
      expect(content).toContain("res.status === 401");
      expect(content).toContain("Please sign in to view your products");
    });

    test("GET /api/products endpoint requires authentication", () => {
      const routePath = path.join(
        process.cwd(),
        "app/api/[[...route]]/route.ts"
      );
      const content = fs.readFileSync(routePath, "utf-8");
      expect(content).toContain('app.get("/products"');
      expect(content).toContain('c.get("user")');
      expect(content).toContain("Unauthorized");
    });

    test("GET /api/products returns user-specific products", () => {
      const routePath = path.join(
        process.cwd(),
        "app/api/[[...route]]/route.ts"
      );
      const content = fs.readFileSync(routePath, "utf-8");
      expect(content).toContain("eq(products.userId, user.id)");
    });
  });

  describe("4. Session Management", () => {
    test("session middleware extracts user from request", () => {
      const routePath = path.join(
        process.cwd(),
        "app/api/[[...route]]/route.ts"
      );
      const content = fs.readFileSync(routePath, "utf-8");
      expect(content).toContain("auth.api.getSession");
      expect(content).toContain('c.set("user"');
      expect(content).toContain('c.set("session"');
    });

    test("auth API route handler exists", () => {
      const authRoutePath = path.join(
        process.cwd(),
        "app/api/auth/[...all]/route.ts"
      );
      expect(fs.existsSync(authRoutePath)).toBe(true);
      const content = fs.readFileSync(authRoutePath, "utf-8");
      expect(content).toContain("toNextJsHandler");
      expect(content).toContain("export const { GET, POST }");
    });

    test("session config has proper expiry", () => {
      const authPath = path.join(process.cwd(), "lib/auth/index.ts");
      const content = fs.readFileSync(authPath, "utf-8");
      expect(content).toContain("expiresIn:");
      expect(content).toContain("60 * 60 * 24 * 7");
    });
  });

  describe("5. No Email Verification Required", () => {
    test("auth config does not require email verification", () => {
      const authPath = path.join(process.cwd(), "lib/auth/index.ts");
      const content = fs.readFileSync(authPath, "utf-8");
      expect(content).not.toContain("requireEmailVerification: true");
      expect(content).not.toContain("sendVerificationEmail");
    });

    test("signup does not mention email verification in UI", () => {
      const signupPath = path.join(process.cwd(), "app/(auth)/signup/page.tsx");
      const content = fs.readFileSync(signupPath, "utf-8");
      expect(content).not.toContain("verify your email");
      expect(content).not.toContain("verification link");
    });
  });
});

describe("Auth Flow Database Operations", () => {
  test("can create user record", async () => {
    const userId = crypto.randomUUID();
    const now = new Date();

    await db.insert(authSchema.user).values({
      id: userId,
      name: "Test User",
      email: "test@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    const [user] = await db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    expect(user).toBeDefined();
    expect(user.email).toBe("test@example.com");
  });

  test("can create session for user", async () => {
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const now = new Date();

    await db.insert(authSchema.user).values({
      id: userId,
      name: "Session User",
      email: "session@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(authSchema.session).values({
      id: sessionId,
      userId: userId,
      token: "test-session-token",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });

    const [session] = await db
      .select()
      .from(authSchema.session)
      .where(eq(authSchema.session.userId, userId));

    expect(session).toBeDefined();
    expect(session.token).toBe("test-session-token");
  });

  test("can create credential account for user", async () => {
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const now = new Date();

    await db.insert(authSchema.user).values({
      id: userId,
      name: "Credential User",
      email: "credential@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(authSchema.account).values({
      id: accountId,
      userId: userId,
      accountId: userId,
      providerId: "credential",
      password: "hashed_password",
      createdAt: now,
      updatedAt: now,
    });

    const [account] = await db
      .select()
      .from(authSchema.account)
      .where(eq(authSchema.account.userId, userId));

    expect(account).toBeDefined();
    expect(account.providerId).toBe("credential");
    expect(account.password).toBe("hashed_password");
  });

  test("authenticated user can have products", async () => {
    const userId = crypto.randomUUID();
    const productId = crypto.randomUUID();
    const now = new Date();

    await db.insert(authSchema.user).values({
      id: userId,
      name: "Product Owner",
      email: "owner@example.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(dbSchema.products).values({
      id: productId,
      userId: userId,
      url: "https://example.com",
      name: "My Product",
      description: "A great product",
      targetAudience: "Developers",
      createdAt: Math.floor(Date.now() / 1000),
    });

    const [product] = await db
      .select()
      .from(dbSchema.products)
      .where(eq(dbSchema.products.userId, userId));

    expect(product).toBeDefined();
    expect(product.name).toBe("My Product");
  });
});

describe("Landing Page Navigation", () => {
  test("landing page has signup link", () => {
    const landingPath = path.join(process.cwd(), "app/page.tsx");
    const content = fs.readFileSync(landingPath, "utf-8");
    expect(content).toContain('href="/signup"');
  });

  test("landing page has login link", () => {
    const landingPath = path.join(process.cwd(), "app/page.tsx");
    const content = fs.readFileSync(landingPath, "utf-8");
    expect(content).toContain('href="/login"');
  });

  test("login page links to signup", () => {
    const loginPath = path.join(process.cwd(), "app/(auth)/login/page.tsx");
    const content = fs.readFileSync(loginPath, "utf-8");
    expect(content).toContain('href="/signup"');
  });

  test("signup page links to login", () => {
    const signupPath = path.join(process.cwd(), "app/(auth)/signup/page.tsx");
    const content = fs.readFileSync(signupPath, "utf-8");
    expect(content).toContain('href="/login"');
  });
});
