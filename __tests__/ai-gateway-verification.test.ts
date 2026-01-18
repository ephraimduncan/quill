import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("AI Gateway Verification", () => {
  const routeFilePath = join(process.cwd(), "app/api/[[...route]]/route.ts");
  const routeContent = readFileSync(routeFilePath, "utf-8");
  const modelsFilePath = join(process.cwd(), "lib/models.ts");
  const modelsContent = readFileSync(modelsFilePath, "utf-8");

  describe("Gateway configuration", () => {
    test("creates gateway client with createGateway", () => {
      expect(modelsContent).toContain("const gateway = createGateway({");
    });

    test("uses AI_GATEWAY_API_KEY for authentication", () => {
      const apiKeyConfig = modelsContent.match(
        /const gateway = createGateway\(\{[\s\S]*?apiKey:\s*process\.env\.(\w+)/
      );
      expect(apiKeyConfig).not.toBeNull();
      expect(apiKeyConfig![1]).toBe("AI_GATEWAY_API_KEY");
    });

    test("gateway client is defined before model exports", () => {
      const clientDefinition = modelsContent.indexOf("const gateway = createGateway");
      const firstModelExport = modelsContent.indexOf("export const extractModel");
      expect(clientDefinition).toBeLessThan(firstModelExport);
    });
  });

  describe("All AI endpoints use gateway-configured client", () => {
    test("/extract uses gateway client", () => {
      const extractSection = routeContent.match(
        /app\.post\("\/extract"[\s\S]*?(?=app\.(get|post|put|delete|patch)\()/
      );
      expect(extractSection).not.toBeNull();
      expect(extractSection![0]).toContain("generateText({");
      expect(extractSection![0]).toContain("model: extractModel");
    });

    test("/keywords/generate uses gateway client", () => {
      const keywordsSection = routeContent.match(
        /app\.post\("\/keywords\/generate"[\s\S]*?(?=app\.(get|post|put|delete|patch)\()/
      );
      expect(keywordsSection).not.toBeNull();
      expect(keywordsSection![0]).toContain("generateText({");
      expect(keywordsSection![0]).toContain("model: keywordsModel");
    });

    test("/response/generate uses gateway client", () => {
      const responseSection = routeContent.match(
        /app\.post\("\/response\/generate"[\s\S]*?(?=app\.(get|post|put|delete|patch)\(|$)/
      );
      expect(responseSection).not.toBeNull();
      expect(responseSection![0]).toContain("generateText({");
      expect(responseSection![0]).toContain("model: responseModel");
    });
  });

  describe("No direct OpenAI SDK usage", () => {
    test("does not import from @ai-sdk/openai", () => {
      expect(routeContent).not.toMatch(/from\s*["']@ai-sdk\/openai["']/);
    });

    test("does not use OpenAI constructor directly", () => {
      expect(routeContent).not.toMatch(/new OpenAI\(/);
    });

    test("does not import from openai package directly", () => {
      expect(routeContent).not.toMatch(/from\s*["']openai["']/);
    });
  });

  describe("Model configuration", () => {
    test("all AI calls use anthropic/claude-4-5-haiku model via gateway", () => {
      const modelCalls = modelsContent.match(/gateway\(["'][^"']+["']\)/g) || [];
      expect(modelCalls.length).toBeGreaterThan(0);
      for (const call of modelCalls) {
        expect(call).toBe('gateway("anthropic/claude-4-5-haiku")');
      }
    });

    test("uses exactly 3 AI calls (extract, keywords, response)", () => {
      const generateTextCalls = (routeContent.match(/generateText\(/g) || []).length;
      expect(generateTextCalls).toBe(3);
    });

    test("route imports shared model definitions", () => {
      expect(routeContent).toContain('from "@/lib/models"');
    });
  });

  describe("Environment configuration", () => {
    const envExamplePath = join(process.cwd(), ".env.example");
    const envContent = readFileSync(envExamplePath, "utf-8");

    test("AI_GATEWAY_API_KEY is documented in .env.example", () => {
      expect(envContent).toContain("AI_GATEWAY_API_KEY=");
    });

    test("no legacy OPENAI_API_KEY in .env.example", () => {
      expect(envContent).not.toContain("OPENAI_API_KEY=");
    });

    test("gateway documentation comment exists", () => {
      expect(envContent.toLowerCase()).toContain("vercel ai gateway");
    });
  });
});
