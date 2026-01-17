import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("Vercel AI Gateway configuration", () => {
  const routeFilePath = join(process.cwd(), "app/api/[[...route]]/route.ts");
  const envExamplePath = join(process.cwd(), ".env.example");

  describe("route.ts AI configuration", () => {
    const routeContent = readFileSync(routeFilePath, "utf-8");

    test("imports createOpenAI from @ai-sdk/openai", () => {
      expect(routeContent).toContain('import { createOpenAI } from "@ai-sdk/openai"');
    });

    test("does not use direct openai import", () => {
      expect(routeContent).not.toMatch(/import \{ openai \} from "@ai-sdk\/openai"/);
    });

    test("configures baseURL for Vercel AI Gateway", () => {
      expect(routeContent).toContain("https://gateway.ai.vercel.app/v1");
    });

    test("uses VERCEL_AI_GATEWAY_API_KEY environment variable", () => {
      expect(routeContent).toContain("process.env.VERCEL_AI_GATEWAY_API_KEY");
    });

    test("creates openai instance with createOpenAI", () => {
      expect(routeContent).toContain("const openai = createOpenAI({");
    });
  });

  describe(".env.example configuration", () => {
    const envContent = readFileSync(envExamplePath, "utf-8");

    test("includes VERCEL_AI_GATEWAY_API_KEY", () => {
      expect(envContent).toContain("VERCEL_AI_GATEWAY_API_KEY=");
    });

    test("does not include old OPENAI_API_KEY", () => {
      expect(envContent).not.toContain("OPENAI_API_KEY=");
    });

    test("has descriptive comment for AI Gateway", () => {
      expect(envContent).toContain("Vercel AI Gateway");
    });
  });
});
