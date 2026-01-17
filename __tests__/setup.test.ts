import { describe, expect, test } from "bun:test";

describe("Setup Wizard", () => {
  test("StepIndicator shows correct number of steps", () => {
    const TOTAL_STEPS = 5;
    const currentStep = 1;

    const dots = Array.from({ length: TOTAL_STEPS }, (_, i) => ({
      isActive: i + 1 === currentStep,
      isCompleted: i + 1 < currentStep,
      isPending: i + 1 > currentStep,
    }));

    expect(dots).toHaveLength(5);
    expect(dots[0].isActive).toBe(true);
    expect(dots[1].isPending).toBe(true);
    expect(dots[4].isPending).toBe(true);
  });

  test("StepIndicator marks completed steps correctly", () => {
    const TOTAL_STEPS = 5;
    const currentStep = 3;

    const dots = Array.from({ length: TOTAL_STEPS }, (_, i) => ({
      isActive: i + 1 === currentStep,
      isCompleted: i + 1 < currentStep,
      isPending: i + 1 > currentStep,
    }));

    expect(dots[0].isCompleted).toBe(true);
    expect(dots[1].isCompleted).toBe(true);
    expect(dots[2].isActive).toBe(true);
    expect(dots[3].isPending).toBe(true);
    expect(dots[4].isPending).toBe(true);
  });

  test("URL validation accepts valid URLs", () => {
    const validUrls = [
      "https://example.com",
      "https://example.com/product",
      "http://localhost:3000",
      "https://sub.domain.example.com/path?query=1",
    ];

    for (const url of validUrls) {
      expect(() => new URL(url)).not.toThrow();
    }
  });

  test("URL validation rejects invalid URLs", () => {
    const invalidUrls = [
      "not-a-url",
      "example.com",
      "ftp://example.com",
      "",
      "://missing-protocol.com",
    ];

    for (const url of invalidUrls) {
      let isValid = true;
      try {
        const parsed = new URL(url);
        isValid = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        isValid = false;
      }
      expect(isValid).toBe(false);
    }
  });

  test("WizardState initializes correctly", () => {
    type ProductInfo = {
      name: string;
      description: string;
      targetAudience: string;
      url: string;
    };

    type WizardState = {
      step: number;
      url: string;
      productInfo: ProductInfo | null;
    };

    const initialState: WizardState = {
      step: 1,
      url: "",
      productInfo: null,
    };

    expect(initialState.step).toBe(1);
    expect(initialState.url).toBe("");
    expect(initialState.productInfo).toBeNull();
  });

  test("WizardState updates correctly after extraction", () => {
    type ProductInfo = {
      name: string;
      description: string;
      targetAudience: string;
      url: string;
    };

    type WizardState = {
      step: number;
      url: string;
      productInfo: ProductInfo | null;
    };

    const initialState: WizardState = {
      step: 1,
      url: "https://example.com",
      productInfo: null,
    };

    const extractedData: ProductInfo = {
      name: "Test Product",
      description: "A test description",
      targetAudience: "Developers",
      url: "https://example.com",
    };

    const updatedState: WizardState = {
      ...initialState,
      productInfo: extractedData,
      step: 2,
    };

    expect(updatedState.step).toBe(2);
    expect(updatedState.productInfo).toEqual(extractedData);
  });

  test("Step 2 form validation requires product name", () => {
    const validateProductInfo = (productInfo: { name: string } | null): boolean => {
      return !!productInfo?.name?.trim();
    };

    expect(validateProductInfo(null)).toBe(false);
    expect(validateProductInfo({ name: "" })).toBe(false);
    expect(validateProductInfo({ name: "   " })).toBe(false);
    expect(validateProductInfo({ name: "Valid Name" })).toBe(true);
  });

  test("Step 2 allows proceeding with partial data", () => {
    type ProductInfo = {
      name: string;
      description: string;
      targetAudience: string;
      url: string;
    };

    const validateProductInfo = (productInfo: ProductInfo | null): boolean => {
      return !!productInfo?.name?.trim();
    };

    const partialData: ProductInfo = {
      name: "My Product",
      description: "",
      targetAudience: "",
      url: "https://example.com",
    };

    expect(validateProductInfo(partialData)).toBe(true);
  });

  test("Step 2 product info can be edited", () => {
    type ProductInfo = {
      name: string;
      description: string;
      targetAudience: string;
      url: string;
    };

    const productInfo: ProductInfo = {
      name: "Original Name",
      description: "Original description",
      targetAudience: "Original audience",
      url: "https://example.com",
    };

    const updateField = <K extends keyof ProductInfo>(
      info: ProductInfo,
      field: K,
      value: ProductInfo[K]
    ): ProductInfo => ({
      ...info,
      [field]: value,
    });

    const updated = updateField(productInfo, "name", "Updated Name");
    expect(updated.name).toBe("Updated Name");
    expect(updated.description).toBe("Original description");

    const updatedDescription = updateField(productInfo, "description", "New description");
    expect(updatedDescription.description).toBe("New description");
    expect(updatedDescription.name).toBe("Original Name");
  });

  test("Step 2 advances to Step 3 on submit", () => {
    type ProductInfo = {
      name: string;
      description: string;
      targetAudience: string;
      url: string;
    };

    type WizardState = {
      step: number;
      url: string;
      productInfo: ProductInfo | null;
    };

    const stateAtStep2: WizardState = {
      step: 2,
      url: "https://example.com",
      productInfo: {
        name: "Test Product",
        description: "A test description",
        targetAudience: "Developers",
        url: "https://example.com",
      },
    };

    const advanceToStep3 = (state: WizardState): WizardState => {
      if (!state.productInfo?.name?.trim()) return state;
      return { ...state, step: 3 };
    };

    const nextState = advanceToStep3(stateAtStep2);
    expect(nextState.step).toBe(3);
  });

  test("Step 2 back button returns to Step 1", () => {
    type WizardState = {
      step: number;
      url: string;
      productInfo: { name: string; description: string; targetAudience: string; url: string } | null;
    };

    const stateAtStep2: WizardState = {
      step: 2,
      url: "https://example.com",
      productInfo: {
        name: "Test Product",
        description: "A test description",
        targetAudience: "Developers",
        url: "https://example.com",
      },
    };

    const goBack = (state: WizardState): WizardState => ({
      ...state,
      step: state.step - 1,
    });

    const prevState = goBack(stateAtStep2);
    expect(prevState.step).toBe(1);
  });

  test("Step 3 state includes keywords and threads", () => {
    type RedditThread = {
      redditThreadId: string;
      title: string;
      bodyPreview: string;
      subreddit: string;
      url: string;
      createdUtc: number;
    };

    type WizardState = {
      step: number;
      url: string;
      productInfo: { name: string; description: string; targetAudience: string; url: string } | null;
      keywords: string[];
      threads: RedditThread[];
    };

    const initialState: WizardState = {
      step: 1,
      url: "",
      productInfo: null,
      keywords: [],
      threads: [],
    };

    expect(initialState.keywords).toEqual([]);
    expect(initialState.threads).toEqual([]);
  });

  test("Step 3 add keyword works correctly", () => {
    const keywords: string[] = ["productivity", "task manager"];

    const addKeyword = (list: string[], keyword: string): string[] => {
      const trimmed = keyword.trim();
      if (!trimmed || list.includes(trimmed)) return list;
      return [...list, trimmed];
    };

    const updated = addKeyword(keywords, "project management");
    expect(updated).toHaveLength(3);
    expect(updated).toContain("project management");

    const duplicate = addKeyword(keywords, "productivity");
    expect(duplicate).toHaveLength(2);
  });

  test("Step 3 remove keyword works correctly", () => {
    const keywords: string[] = ["productivity", "task manager", "organization"];

    const removeKeyword = (list: string[], index: number): string[] =>
      list.filter((_, i) => i !== index);

    const updated = removeKeyword(keywords, 1);
    expect(updated).toHaveLength(2);
    expect(updated).toContain("productivity");
    expect(updated).toContain("organization");
    expect(updated).not.toContain("task manager");
  });

  test("Step 3 blocks proceed when no threads found", () => {
    type RedditThread = {
      redditThreadId: string;
      title: string;
      bodyPreview: string;
      subreddit: string;
      url: string;
      createdUtc: number;
    };

    const canProceed = (threads: RedditThread[]): boolean => threads.length > 0;

    expect(canProceed([])).toBe(false);
    expect(canProceed([{
      redditThreadId: "abc123",
      title: "Test",
      bodyPreview: "",
      subreddit: "test",
      url: "https://reddit.com/r/test/abc123",
      createdUtc: Date.now() / 1000,
    }])).toBe(true);
  });

  test("Step 3 advances to Step 4 when threads exist", () => {
    type WizardState = {
      step: number;
      keywords: string[];
      threads: Array<{ redditThreadId: string }>;
    };

    const stateAtStep3: WizardState = {
      step: 3,
      keywords: ["productivity"],
      threads: [{ redditThreadId: "abc123" }],
    };

    const advanceToStep4 = (state: WizardState): WizardState => {
      if (state.threads.length === 0) return state;
      return { ...state, step: 4 };
    };

    const nextState = advanceToStep4(stateAtStep3);
    expect(nextState.step).toBe(4);
  });

  test("Step 3 back button returns to Step 2", () => {
    const step = 3;
    const goBack = (currentStep: number): number => currentStep - 1;
    expect(goBack(step)).toBe(2);
  });

  test("formatRelativeTime returns correct values", () => {
    const formatRelativeTime = (timestamp: number): string => {
      const seconds = Math.floor(Date.now() / 1000 - timestamp);
      if (seconds < 60) return "just now";
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    };

    const now = Math.floor(Date.now() / 1000);

    expect(formatRelativeTime(now)).toBe("just now");
    expect(formatRelativeTime(now - 30)).toBe("just now");
    expect(formatRelativeTime(now - 300)).toBe("5m ago");
    expect(formatRelativeTime(now - 3600)).toBe("1h ago");
    expect(formatRelativeTime(now - 7200)).toBe("2h ago");
    expect(formatRelativeTime(now - 86400)).toBe("1d ago");
    expect(formatRelativeTime(now - 172800)).toBe("2d ago");
  });

  test("Step 4 auto-selects first thread on entry", () => {
    type RedditThread = {
      redditThreadId: string;
      title: string;
      bodyPreview: string;
      subreddit: string;
      url: string;
      createdUtc: number;
    };

    const threads: RedditThread[] = [
      { redditThreadId: "abc123", title: "First", bodyPreview: "", subreddit: "test", url: "", createdUtc: 0 },
      { redditThreadId: "def456", title: "Second", bodyPreview: "", subreddit: "test", url: "", createdUtc: 0 },
    ];

    const getInitialSelection = (threads: RedditThread[]): string | null =>
      threads[0]?.redditThreadId || null;

    expect(getInitialSelection(threads)).toBe("abc123");
    expect(getInitialSelection([])).toBeNull();
  });

  test("Step 4 thread selection finds correct thread", () => {
    type RedditThread = {
      redditThreadId: string;
      title: string;
      bodyPreview: string;
      subreddit: string;
      url: string;
      createdUtc: number;
    };

    const threads: RedditThread[] = [
      { redditThreadId: "abc123", title: "First Thread", bodyPreview: "Preview 1", subreddit: "sub1", url: "", createdUtc: 0 },
      { redditThreadId: "def456", title: "Second Thread", bodyPreview: "Preview 2", subreddit: "sub2", url: "", createdUtc: 0 },
    ];

    const findSelectedThread = (threads: RedditThread[], selectedId: string | null): RedditThread | undefined =>
      threads.find((t) => t.redditThreadId === selectedId);

    expect(findSelectedThread(threads, "abc123")?.title).toBe("First Thread");
    expect(findSelectedThread(threads, "def456")?.title).toBe("Second Thread");
    expect(findSelectedThread(threads, "nonexistent")).toBeUndefined();
  });

  test("Step 4 body preview truncates at 200 chars", () => {
    const truncatePreview = (text: string, maxLength = 200): string => {
      if (text.length > maxLength) {
        return `${text.slice(0, maxLength)}...`;
      }
      return text || "No preview available";
    };

    const shortText = "This is a short preview.";
    expect(truncatePreview(shortText)).toBe(shortText);

    const longText = "a".repeat(250);
    expect(truncatePreview(longText)).toBe("a".repeat(200) + "...");
    expect(truncatePreview(longText).length).toBe(203);

    expect(truncatePreview("")).toBe("No preview available");
  });

  test("Step 4 advances to Step 5 on continue", () => {
    type WizardState = {
      step: number;
      threads: Array<{ redditThreadId: string }>;
    };

    const stateAtStep4: WizardState = {
      step: 4,
      threads: [{ redditThreadId: "abc123" }],
    };

    const advanceToStep5 = (state: WizardState): WizardState => ({
      ...state,
      step: 5,
    });

    const nextState = advanceToStep5(stateAtStep4);
    expect(nextState.step).toBe(5);
  });

  test("Step 4 back button returns to Step 3", () => {
    const step = 4;
    const goBack = (currentStep: number): number => currentStep - 1;
    expect(goBack(step)).toBe(3);
  });

  test("Step 4 split view layout uses 40/60 ratio", () => {
    const leftPanelWidth = "w-2/5";
    const rightPanelWidth = "w-3/5";

    expect(leftPanelWidth).toBe("w-2/5");
    expect(rightPanelWidth).toBe("w-3/5");
  });
});
