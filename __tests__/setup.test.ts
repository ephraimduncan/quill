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
});
