import { describe, expect, test } from "bun:test";
import * as fs from "fs";

describe("Thread Selection Verification", () => {
  const monitorPageContent = fs.readFileSync(
    "app/(app)/monitor/[productId]/page.tsx",
    "utf-8"
  );

  test("thread list items are clickable buttons", () => {
    expect(monitorPageContent).toContain("<button");
    expect(monitorPageContent).toContain("onClick={() => handleThreadSelect(thread.id)}");
  });

  test("handleThreadSelect updates selectedThreadId state", () => {
    expect(monitorPageContent).toContain("const [selectedThreadId, setSelectedThreadId]");
    expect(monitorPageContent).toContain("setSelectedThreadId(threadId)");
  });

  test("selected thread is highlighted with bg-muted class", () => {
    expect(monitorPageContent).toContain('selectedThreadId === thread.id ? "bg-muted"');
  });

  test("selected thread data is passed to detail panel", () => {
    expect(monitorPageContent).toContain("const selectedThread = activeThreads.find((t) => t.id === selectedThreadId)");
  });

  test("first thread is auto-selected on page load", () => {
    expect(monitorPageContent).toContain("if (activeThreads.length > 0)");
    expect(monitorPageContent).toContain("setSelectedThreadId(activeThreads[0].id)");
  });
});

describe("Response Generation API Verification", () => {
  const routeContent = fs.readFileSync(
    "app/api/[[...route]]/route.ts",
    "utf-8"
  );

  test("POST /api/response/generate endpoint exists", () => {
    expect(routeContent).toContain('app.post("/response/generate"');
  });

  test("endpoint requires authentication", () => {
    expect(routeContent).toMatch(/\/response\/generate.*user.*Unauthorized/s);
  });

  test("endpoint validates request with Zod schema", () => {
    expect(routeContent).toContain("generateResponseSchema.safeParse");
    expect(routeContent).toContain("Invalid request data");
  });

  test("endpoint uses Vercel AI SDK generateText", () => {
    expect(routeContent).toContain('import { generateObject, generateText } from "ai"');
    expect(routeContent).toContain("generateText({");
  });

  test("prompt includes thread title and subreddit", () => {
    expect(routeContent).toContain("r/${thread.subreddit}");
    expect(routeContent).toContain("Title: ${thread.title}");
  });

  test("prompt includes product name and description", () => {
    expect(routeContent).toContain("Name: ${product.name}");
    expect(routeContent).toContain("Description: ${product.description}");
  });

  test("returns generated response text", () => {
    expect(routeContent).toContain("const { text } = await generateText");
    expect(routeContent).toContain("response: text");
  });
});

describe("ResponseEditorPanel Generation Verification", () => {
  const editorContent = fs.readFileSync(
    "components/response-editor-panel.tsx",
    "utf-8"
  );

  test("has Generate Response button", () => {
    expect(editorContent).toContain("Generate Response");
    expect(editorContent).toContain("<Sparkles");
  });

  test("generates response via fetch to API", () => {
    expect(editorContent).toContain('fetch("/api/response/generate"');
    expect(editorContent).toContain('method: "POST"');
  });

  test("sends thread data in request body", () => {
    expect(editorContent).toContain("thread: {");
    expect(editorContent).toContain("title: thread.title");
    expect(editorContent).toContain("body: thread.bodyPreview");
    expect(editorContent).toContain("subreddit: thread.subreddit");
  });

  test("sends product data in request body", () => {
    expect(editorContent).toContain("product: {");
    expect(editorContent).toContain("name: product.name");
    expect(editorContent).toContain("description: product.description");
    expect(editorContent).toContain("targetAudience: product.targetAudience");
  });

  test("shows loading state during generation", () => {
    expect(editorContent).toContain("isGenerating");
    expect(editorContent).toContain("setIsGenerating(true)");
    expect(editorContent).toContain("Generating response...");
    expect(editorContent).toContain("<Spinner");
  });

  test("displays generated response in textarea", () => {
    expect(editorContent).toContain("setResponse(data.response)");
    expect(editorContent).toContain("value={response}");
    expect(editorContent).toContain("<Textarea");
  });

  test("has Regenerate button for variation", () => {
    expect(editorContent).toContain("Regenerate");
    expect(editorContent).toContain("<RefreshCw");
  });

  test("displays error message on failure", () => {
    expect(editorContent).toContain("setError(");
    expect(editorContent).toContain("text-destructive");
    expect(editorContent).toContain("{error}");
  });
});

describe("Copy Button Verification", () => {
  const editorContent = fs.readFileSync(
    "components/response-editor-panel.tsx",
    "utf-8"
  );

  test("has Copy button", () => {
    expect(editorContent).toContain("<Copy");
    expect(editorContent).toContain("Copy");
  });

  test("copyToClipboard function uses navigator.clipboard", () => {
    expect(editorContent).toContain("copyToClipboard");
    expect(editorContent).toContain("navigator.clipboard.writeText(response)");
  });

  test("shows toast notification on copy", () => {
    expect(editorContent).toContain('toast.success("Response copied to clipboard")');
  });

  test("shows Copied state with Check icon", () => {
    expect(editorContent).toContain("copied");
    expect(editorContent).toContain("setCopied(true)");
    expect(editorContent).toContain("<Check");
    expect(editorContent).toContain("Copied");
  });

  test("resets copied state after 2 seconds", () => {
    expect(editorContent).toContain("setTimeout(() => setCopied(false), 2000)");
  });

  test("Copy button onClick calls copyToClipboard", () => {
    expect(editorContent).toContain("onClick={copyToClipboard}");
  });
});

describe("Reddit Link Verification", () => {
  const monitorPageContent = fs.readFileSync(
    "app/(app)/monitor/[productId]/page.tsx",
    "utf-8"
  );

  test("has Open in Reddit link", () => {
    expect(monitorPageContent).toContain("Open in Reddit");
  });

  test("link uses thread URL", () => {
    expect(monitorPageContent).toContain("href={selectedThread.url}");
  });

  test("link opens in new tab", () => {
    expect(monitorPageContent).toContain('target="_blank"');
  });

  test("link has noopener noreferrer for security", () => {
    expect(monitorPageContent).toContain('rel="noopener noreferrer"');
  });

  test("link has ExternalLink icon", () => {
    expect(monitorPageContent).toContain("<ExternalLink");
  });
});

describe("Thread Detail Panel Verification", () => {
  const monitorPageContent = fs.readFileSync(
    "app/(app)/monitor/[productId]/page.tsx",
    "utf-8"
  );

  test("shows thread title in detail panel", () => {
    expect(monitorPageContent).toContain("{selectedThread.title}");
  });

  test("shows thread body preview", () => {
    expect(monitorPageContent).toContain("selectedThread.bodyPreview");
  });

  test("truncates long body preview at 200 chars", () => {
    expect(monitorPageContent).toContain("selectedThread.bodyPreview.length > 200");
    expect(monitorPageContent).toContain("selectedThread.bodyPreview.slice(0, 200)");
  });

  test("shows subreddit name", () => {
    expect(monitorPageContent).toContain("r/{selectedThread.subreddit}");
  });

  test("shows relative time", () => {
    expect(monitorPageContent).toContain("formatRelativeTime(selectedThread.createdUtc)");
  });

  test("has placeholder when no thread selected", () => {
    expect(monitorPageContent).toContain("Select a thread to view details");
  });
});

describe("ResponseEditorPanel Integration Verification", () => {
  const monitorPageContent = fs.readFileSync(
    "app/(app)/monitor/[productId]/page.tsx",
    "utf-8"
  );

  test("ResponseEditorPanel is imported", () => {
    expect(monitorPageContent).toContain(
      'import { ResponseEditorPanel } from "@/components/response-editor-panel"'
    );
  });

  test("ResponseEditorPanel is rendered in detail panel", () => {
    expect(monitorPageContent).toContain("<ResponseEditorPanel");
  });

  test("passes thread data to ResponseEditorPanel", () => {
    expect(monitorPageContent).toContain("thread={{");
    expect(monitorPageContent).toContain("title: selectedThread.title");
    expect(monitorPageContent).toContain("bodyPreview: selectedThread.bodyPreview");
    expect(monitorPageContent).toContain("subreddit: selectedThread.subreddit");
  });

  test("passes product data to ResponseEditorPanel", () => {
    expect(monitorPageContent).toContain("product={{");
    expect(monitorPageContent).toContain("name: product.name");
    expect(monitorPageContent).toContain("description: product.description");
    expect(monitorPageContent).toContain("targetAudience: product.targetAudience");
  });

  test("uses key prop to reset state on thread change", () => {
    expect(monitorPageContent).toContain("key={selectedThread.id}");
  });
});
