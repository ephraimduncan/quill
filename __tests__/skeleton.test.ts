import { describe, expect, test } from "bun:test";

describe("Skeleton Components", () => {
  test("Skeleton component exports correctly", async () => {
    const skeletonModule = await import("../components/ui/skeleton");
    expect(skeletonModule.Skeleton).toBeDefined();
    expect(typeof skeletonModule.Skeleton).toBe("function");
  });

  test("Spinner component exports correctly", async () => {
    const spinnerModule = await import("../components/ui/spinner");
    expect(spinnerModule.Spinner).toBeDefined();
    expect(typeof spinnerModule.Spinner).toBe("function");
  });

  test("ProductCardSkeleton component exports correctly", async () => {
    const productCardSkeletonModule = await import("../components/product-card-skeleton");
    expect(productCardSkeletonModule.ProductCardSkeleton).toBeDefined();
    expect(typeof productCardSkeletonModule.ProductCardSkeleton).toBe("function");
  });
});

describe("Skeleton Component Props", () => {
  test("Skeleton accepts className prop", async () => {
    const { Skeleton } = await import("../components/ui/skeleton");
    const element = Skeleton({ className: "custom-class" });
    expect(element).toBeDefined();
    expect(element.props.className).toContain("custom-class");
  });

  test("Spinner accepts size prop", async () => {
    const { Spinner } = await import("../components/ui/spinner");
    const smallSpinner = Spinner({ size: "sm" });
    const mediumSpinner = Spinner({ size: "md" });
    const largeSpinner = Spinner({ size: "lg" });

    expect(smallSpinner.props.className).toContain("size-4");
    expect(mediumSpinner.props.className).toContain("size-8");
    expect(largeSpinner.props.className).toContain("size-12");
  });

  test("Spinner defaults to medium size", async () => {
    const { Spinner } = await import("../components/ui/spinner");
    const defaultSpinner = Spinner({});
    expect(defaultSpinner.props.className).toContain("size-8");
  });
});
