import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("AI Gateway Verification", () => {
  const routeFilePath = join(process.cwd(), "app/api/[[...route]]/route.ts");
  const routeContent = readFileSync(routeFilePath, "utf-8");

  describe("Gateway configuration", () => {
    test("creates openai client with Vercel AI Gateway baseURL", () => {
      const gatewayConfig = routeContent.match(
        /const openai = createOpenAI\(\{[\s\S]*?baseURL:\s*["']([^"']+)["']/
      );
      expect(gatewayConfig).not.toBeNull();
      expect(gatewayConfig![1]).toBe("https://gateway.ai.vercel.app/v1");
    });

    test("uses VERCEL_AI_GATEWAY_API_KEY for authentication", () => {
      const apiKeyConfig = routeContent.match(
        /const openai = createOpenAI\(\{[\s\S]*?apiKey:\s*process\.env\.(\w+)/
      );
      expect(apiKeyConfig).not.toBeNull();
      expect(apiKeyConfig![1]).toBe("VERCEL_AI_GATEWAY_API_KEY");
    });

    test("openai client is defined before any AI calls", () => {
      const clientDefinition = routeContent.indexOf("const openai = createOpenAI");
      const firstAICall = routeContent.indexOf("generateObject({");
      expect(clientDefinition).toBeLessThan(firstAICall);
    });
  });

  describe("All AI endpoints use gateway-configured client", () => {
    test("/extract uses gateway openai client", () => {
      const extractSection = routeContent.match(
        /app\.post\("\/extract"[\s\S]*?(?=app\.(get|post|put|delete|patch)\()/
      );
      expect(extractSection).not.toBeNull();
      expect(extractSection![0]).toContain("generateObject({");
      expect(extractSection![0]).toContain('model: openai("gpt-4o-mini")');
    });

    test("/keywords/generate uses gateway openai client", () => {
      const keywordsSection = routeContent.match(
        /app\.post\("\/keywords\/generate"[\s\S]*?(?=app\.(get|post|put|delete|patch)\()/
      );
      expect(keywordsSection).not.toBeNull();
      expect(keywordsSection![0]).toContain("generateObject({");
      expect(keywordsSection![0]).toContain('model: openai("gpt-4o-mini")');
    });

    test("/response/generate uses gateway openai client", () => {
      const responseSection = routeContent.match(
        /app\.post\("\/response\/generate"[\s\S]*?(?=app\.(get|post|put|delete|patch)\(|$)/
      );
      expect(responseSection).not.toBeNull();
      expect(responseSection![0]).toContain("generateText({");
      expect(responseSection![0]).toContain('model: openai("gpt-4o-mini")');
    });
  });

  describe("No direct OpenAI SDK usage", () => {
    test("does not import openai directly from @ai-sdk/openai", () => {
      expect(routeContent).not.toMatch(/import\s*\{\s*openai\s*\}\s*from\s*["']@ai-sdk\/openai["']/);
    });

    test("does not use OpenAI constructor directly", () => {
      expect(routeContent).not.toMatch(/new OpenAI\(/);
    });

    test("does not import from openai package directly", () => {
      expect(routeContent).not.toMatch(/from\s*["']openai["']/);
    });
  });

  describe("Model configuration", () => {
    test("all AI calls use gpt-4o-mini model", () => {
      const modelCalls = routeContent.match(/openai\(["'][^"']+["']\)/g) || [];
      expect(modelCalls.length).toBeGreaterThan(0);
      for (const call of modelCalls) {
        expect(call).toBe('openai("gpt-4o-mini")');
      }
    });

    test("uses exactly 3 AI calls (extract, keywords, response)", () => {
      const generateObjectCalls = (routeContent.match(/generateObject\(/g) || []).length;
      const generateTextCalls = (routeContent.match(/generateText\(/g) || []).length;
      expect(generateObjectCalls).toBe(2);
      expect(generateTextCalls).toBe(1);
    });
  });

  describe("Environment configuration", () => {
    const envExamplePath = join(process.cwd(), ".env.example");
    const envContent = readFileSync(envExamplePath, "utf-8");

    test("VERCEL_AI_GATEWAY_API_KEY is documented in .env.example", () => {
      expect(envContent).toContain("VERCEL_AI_GATEWAY_API_KEY=");
    });

    test("no legacy OPENAI_API_KEY in .env.example", () => {
      expect(envContent).not.toContain("OPENAI_API_KEY=");
    });

    test("gateway documentation comment exists", () => {
      expect(envContent.toLowerCase()).toContain("vercel ai gateway");
    });
  });

  describe("Gateway URL format", () => {
    test("gateway URL uses HTTPS", () => {
      expect(routeContent).toContain("https://gateway.ai.vercel.app");
    });

    test("gateway URL includes /v1 path", () => {
      expect(routeContent).toContain("gateway.ai.vercel.app/v1");
    });

    test("gateway URL is complete and valid", () => {
      const url = "https://gateway.ai.vercel.app/v1";
      expect(routeContent).toContain(`baseURL: "${url}"`);
    });
  });
});
