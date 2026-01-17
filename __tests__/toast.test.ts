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

  test("toast.success is called when response is copied", () => {
    const panelPath = join(process.cwd(), "components/response-editor-panel.tsx");
    const panelContent = readFileSync(panelPath, "utf-8");

    expect(panelContent).toContain('toast.success("Response copied to clipboard")');
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
