import { describe, expect, test } from "bun:test";

describe("App Shell Components", () => {
  test("Header component exports correctly", async () => {
    const headerModule = await import("../components/header");
    expect(headerModule.Header).toBeDefined();
    expect(typeof headerModule.Header).toBe("function");
  });

  test("Sidebar component exports correctly", async () => {
    const sidebarModule = await import("../components/sidebar");
    expect(sidebarModule.Sidebar).toBeDefined();
    expect(typeof sidebarModule.Sidebar).toBe("function");
  });

  test("AppShell component exports correctly", async () => {
    const appShellModule = await import("../components/app-shell");
    expect(appShellModule.AppShell).toBeDefined();
    expect(typeof appShellModule.AppShell).toBe("function");
  });

  test("UserMenu component exports correctly", async () => {
    const userMenuModule = await import("../components/user-menu");
    expect(userMenuModule.UserMenu).toBeDefined();
    expect(typeof userMenuModule.UserMenu).toBe("function");
  });
});

describe("App Layout", () => {
  test("app layout exports default function", async () => {
    const layoutModule = await import("../app/(app)/layout");
    expect(layoutModule.default).toBeDefined();
    expect(typeof layoutModule.default).toBe("function");
  });

  test("dashboard page exports default function", async () => {
    const dashboardModule = await import("../app/(app)/dashboard/page");
    expect(dashboardModule.default).toBeDefined();
    expect(typeof dashboardModule.default).toBe("function");
  });

  test("settings page exports default function", async () => {
    const settingsModule = await import("../app/(app)/settings/page");
    expect(settingsModule.default).toBeDefined();
    expect(typeof settingsModule.default).toBe("function");
  });

  test("landing page exports default function", async () => {
    const landingModule = await import("../app/page");
    expect(landingModule.default).toBeDefined();
    expect(typeof landingModule.default).toBe("function");
  });
});
