import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Toast notifications configuration", () => {
  test("Toaster component is imported in root layout", () => {
    const layoutPath = join(process.cwd(), "app/layout.tsx");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    expect(layoutContent).toContain('import { Toaster } from "sonner"');
  });

  test("Toaster component is rendered in root layout", () => {
    const layoutPath = join(process.cwd(), "app/layout.tsx");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    expect(layoutContent).toContain("<Toaster");
  });

  test("Toaster is positioned at bottom-right", () => {
    const layoutPath = join(process.cwd(), "app/layout.tsx");
    const layoutContent = readFileSync(layoutPath, "utf-8");

    expect(layoutContent).toContain('position="bottom-right"');
  });
});

describe("Toast in response editor panel", () => {
  test("toast is imported from sonner in response editor panel", () => {
    const panelPath = join(process.cwd(), "components/response-editor-panel.tsx");
    const panelContent = readFileSync(panelPath, "utf-8");

    expect(panelContent).toContain('import { toast } from "sonner"');
  });

  test("toast.success is called on successful post", () => {
    const panelPath = join(process.cwd(), "components/response-editor-panel.tsx");
    const panelContent = readFileSync(panelPath, "utf-8");

    expect(panelContent).toContain('toast.success("Posted to Reddit successfully!")');
  });

  test("toast.success is called after setIsPosted(true)", () => {
    const panelPath = join(process.cwd(), "components/response-editor-panel.tsx");
    const panelContent = readFileSync(panelPath, "utf-8");

    const setIsPostedIndex = panelContent.indexOf("setIsPosted(true)");
    const toastIndex = panelContent.indexOf('toast.success("Posted to Reddit successfully!")');

    expect(setIsPostedIndex).toBeGreaterThan(-1);
    expect(toastIndex).toBeGreaterThan(-1);
    expect(toastIndex).toBeGreaterThan(setIsPostedIndex);
  });
});

describe("sonner package", () => {
  test("sonner is installed as a dependency", () => {
    const packagePath = join(process.cwd(), "package.json");
    const packageContent = readFileSync(packagePath, "utf-8");
    const packageJson = JSON.parse(packageContent);

    expect(packageJson.dependencies).toHaveProperty("sonner");
  });
});
