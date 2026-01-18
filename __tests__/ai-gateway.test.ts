import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Vercel AI Gateway configuration", () => {
  const routeFilePath = join(process.cwd(), "app/api/[[...route]]/route.ts");
  const modelsFilePath = join(process.cwd(), "lib/models.ts");
  const envExamplePath = join(process.cwd(), ".env.example");

  describe("route.ts AI configuration", () => {
    const routeContent = readFileSync(routeFilePath, "utf-8");
    const modelsContent = readFileSync(modelsFilePath, "utf-8");

    test("imports shared model definitions", () => {
      expect(routeContent).toContain('from "@/lib/models"');
    });

    test("models.ts uses createGateway from ai package", () => {
      expect(modelsContent).toContain("createGateway");
      expect(modelsContent).toContain('from "ai"');
    });

    test("does not use direct openai import from @ai-sdk/openai", () => {
      expect(routeContent).not.toMatch(/from ["']@ai-sdk\/openai["']/);
    });

    test("uses AI_GATEWAY_API_KEY environment variable", () => {
      expect(modelsContent).toContain("process.env.AI_GATEWAY_API_KEY");
    });

    test("creates gateway instance with createGateway", () => {
      expect(modelsContent).toContain("const gateway = createGateway({");
    });

    test("uses gateway with anthropic haiku model", () => {
      expect(modelsContent).toContain('gateway("anthropic/claude-4-5-haiku")');
    });
  });

  describe(".env.example configuration", () => {
    const envContent = readFileSync(envExamplePath, "utf-8");

    test("includes AI_GATEWAY_API_KEY", () => {
      expect(envContent).toContain("AI_GATEWAY_API_KEY=");
    });

    test("does not include old OPENAI_API_KEY", () => {
      expect(envContent).not.toContain("OPENAI_API_KEY=");
    });

    test("has descriptive comment for AI Gateway", () => {
      expect(envContent).toContain("Vercel AI Gateway");
    });
  });
});
