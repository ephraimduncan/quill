import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("Email/Password Auth Config", () => {
  test("auth config file contains emailAndPassword enabled", () => {
    const authConfigPath = path.join(process.cwd(), "lib/auth/index.ts");
    const content = fs.readFileSync(authConfigPath, "utf-8");
    expect(content).toContain("emailAndPassword");
    expect(content).toContain("enabled: true");
  });

  test("auth config keeps Reddit social provider (migration phase)", () => {
    const authConfigPath = path.join(process.cwd(), "lib/auth/index.ts");
    const content = fs.readFileSync(authConfigPath, "utf-8");
    expect(content).toContain("socialProviders");
    expect(content).toContain("reddit:");
  });
});

describe("Auth Client", () => {
  test("exports signUp method", async () => {
    const { signUp } = await import("../lib/auth/client");
    expect(signUp).toBeDefined();
  });

  test("exports signIn, signUp, signOut, useSession", async () => {
    const { signIn, signUp, signOut, useSession } = await import(
      "../lib/auth/client"
    );
    expect(signIn).toBeDefined();
    expect(signUp).toBeDefined();
    expect(signOut).toBeDefined();
    expect(useSession).toBeDefined();
  });

  test("signUp has email method", async () => {
    const { signUp } = await import("../lib/auth/client");
    expect(signUp.email).toBeDefined();
    expect(typeof signUp.email).toBe("function");
  });

  test("signIn has email method", async () => {
    const { signIn } = await import("../lib/auth/client");
    expect(signIn.email).toBeDefined();
    expect(typeof signIn.email).toBe("function");
  });
});

describe("Login Page", () => {
  test("login page exports default function", async () => {
    const loginModule = await import("../app/(auth)/login/page");
    expect(loginModule.default).toBeDefined();
    expect(typeof loginModule.default).toBe("function");
  });

  test("login page file contains email input", () => {
    const loginPagePath = path.join(
      process.cwd(),
      "app/(auth)/login/page.tsx"
    );
    const content = fs.readFileSync(loginPagePath, "utf-8");
    expect(content).toContain('type="email"');
    expect(content).toContain('id="email"');
  });

  test("login page file contains password input", () => {
    const loginPagePath = path.join(
      process.cwd(),
      "app/(auth)/login/page.tsx"
    );
    const content = fs.readFileSync(loginPagePath, "utf-8");
    expect(content).toContain('type="password"');
    expect(content).toContain('id="password"');
  });

  test("login page uses signIn.email", () => {
    const loginPagePath = path.join(
      process.cwd(),
      "app/(auth)/login/page.tsx"
    );
    const content = fs.readFileSync(loginPagePath, "utf-8");
    expect(content).toContain("signIn.email");
  });

  test("login page links to signup page", () => {
    const loginPagePath = path.join(
      process.cwd(),
      "app/(auth)/login/page.tsx"
    );
    const content = fs.readFileSync(loginPagePath, "utf-8");
    expect(content).toContain('href="/signup"');
  });
});

describe("Signup Page", () => {
  test("signup page exports default function", async () => {
    const signupModule = await import("../app/(auth)/signup/page");
    expect(signupModule.default).toBeDefined();
    expect(typeof signupModule.default).toBe("function");
  });

  test("signup page file contains name input", () => {
    const signupPagePath = path.join(
      process.cwd(),
      "app/(auth)/signup/page.tsx"
    );
    const content = fs.readFileSync(signupPagePath, "utf-8");
    expect(content).toContain('id="name"');
  });

  test("signup page file contains email input", () => {
    const signupPagePath = path.join(
      process.cwd(),
      "app/(auth)/signup/page.tsx"
    );
    const content = fs.readFileSync(signupPagePath, "utf-8");
    expect(content).toContain('type="email"');
    expect(content).toContain('id="email"');
  });

  test("signup page file contains password input", () => {
    const signupPagePath = path.join(
      process.cwd(),
      "app/(auth)/signup/page.tsx"
    );
    const content = fs.readFileSync(signupPagePath, "utf-8");
    expect(content).toContain('type="password"');
    expect(content).toContain('id="password"');
  });

  test("signup page has password minimum length hint", () => {
    const signupPagePath = path.join(
      process.cwd(),
      "app/(auth)/signup/page.tsx"
    );
    const content = fs.readFileSync(signupPagePath, "utf-8");
    expect(content).toContain("minLength={8}");
    expect(content).toContain("at least 8 characters");
  });

  test("signup page uses signUp.email", () => {
    const signupPagePath = path.join(
      process.cwd(),
      "app/(auth)/signup/page.tsx"
    );
    const content = fs.readFileSync(signupPagePath, "utf-8");
    expect(content).toContain("signUp.email");
  });

  test("signup page links to login page", () => {
    const signupPagePath = path.join(
      process.cwd(),
      "app/(auth)/signup/page.tsx"
    );
    const content = fs.readFileSync(signupPagePath, "utf-8");
    expect(content).toContain('href="/login"');
  });
});

describe("Landing Page", () => {
  test("landing page links to signup", () => {
    const landingPagePath = path.join(process.cwd(), "app/page.tsx");
    const content = fs.readFileSync(landingPagePath, "utf-8");
    expect(content).toContain('href="/signup"');
  });

  test("landing page links to login", () => {
    const landingPagePath = path.join(process.cwd(), "app/page.tsx");
    const content = fs.readFileSync(landingPagePath, "utf-8");
    expect(content).toContain('href="/login"');
  });

  test("landing page no longer has Reddit sign-in button", () => {
    const landingPagePath = path.join(process.cwd(), "app/page.tsx");
    const content = fs.readFileSync(landingPagePath, "utf-8");
    expect(content).not.toContain("IconBrandReddit");
    expect(content).not.toContain("Sign in with Reddit");
  });

  test("landing page has Get started and Sign in buttons", () => {
    const landingPagePath = path.join(process.cwd(), "app/page.tsx");
    const content = fs.readFileSync(landingPagePath, "utf-8");
    expect(content).toContain("Get started");
    expect(content).toContain("Sign in");
  });
});
