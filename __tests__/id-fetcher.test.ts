import { describe, expect, test } from "bun:test";
import {
  base36ToNumber,
  numberToBase36,
  generateIdRange,
} from "@/lib/reddit/id-fetcher";

describe("base36ToNumber", () => {
  test("converts 0 to 0n", () => {
    expect(base36ToNumber("0")).toBe(0n);
  });

  test("converts single digit", () => {
    expect(base36ToNumber("a")).toBe(10n);
    expect(base36ToNumber("z")).toBe(35n);
  });

  test("converts multi-digit base36", () => {
    expect(base36ToNumber("10")).toBe(36n);
    expect(base36ToNumber("zz")).toBe(1295n);
  });

  test("handles uppercase input", () => {
    expect(base36ToNumber("ABC")).toBe(base36ToNumber("abc"));
  });

  test("throws on invalid character", () => {
    expect(() => base36ToNumber("!")).toThrow("Invalid base36 character");
  });

  test("converts realistic Reddit post ID", () => {
    const result = base36ToNumber("1abc123");
    expect(result).toBeGreaterThan(0n);
  });
});

describe("numberToBase36", () => {
  test("converts 0n to 0", () => {
    expect(numberToBase36(0n)).toBe("0");
  });

  test("converts single digit", () => {
    expect(numberToBase36(10n)).toBe("a");
    expect(numberToBase36(35n)).toBe("z");
  });

  test("converts multi-digit number", () => {
    expect(numberToBase36(36n)).toBe("10");
    expect(numberToBase36(1295n)).toBe("zz");
  });

  test("round-trips correctly", () => {
    const original = "1abc123";
    const num = base36ToNumber(original);
    expect(numberToBase36(num)).toBe(original);
  });
});

describe("generateIdRange", () => {
  test("returns empty array when end <= start", () => {
    expect(generateIdRange("10", "10")).toEqual([]);
    expect(generateIdRange("20", "10")).toEqual([]);
  });

  test("generates correct number of IDs", () => {
    const ids = generateIdRange("0", "5");
    expect(ids.length).toBe(5);
  });

  test("returns IDs in descending order (newest first)", () => {
    const ids = generateIdRange("0", "5");
    expect(ids[0]).toBe("5");
    expect(ids[4]).toBe("1");
  });

  test("respects maxCount limit", () => {
    const ids = generateIdRange("0", "1000", 50);
    expect(ids.length).toBe(50);
  });

  test("defaults to 100 max IDs", () => {
    const ids = generateIdRange("0", "500");
    expect(ids.length).toBe(100);
  });

  test("handles realistic Reddit ID range", () => {
    const ids = generateIdRange("1abc100", "1abc10a", 20);
    expect(ids.length).toBe(10);
    expect(ids[0]).toBe("1abc10a");
  });
});
