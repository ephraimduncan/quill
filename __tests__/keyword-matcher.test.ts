import { describe, expect, test } from "bun:test";
import { AhoCorasick, buildMatcher, type KeywordEntry } from "@/lib/reddit/keyword-matcher";

describe("AhoCorasick", () => {
  test("matches single keyword", () => {
    const entries: KeywordEntry[] = [
      { keyword: "hello", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("hello world");

    expect(results.length).toBe(1);
    expect(results[0].keyword).toBe("hello");
    expect(results[0].productId).toBe("prod-1");
  });

  test("matches multiple keywords", () => {
    const entries: KeywordEntry[] = [
      { keyword: "hello", productId: "prod-1" },
      { keyword: "world", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("hello world");

    expect(results.length).toBe(2);
  });

  test("matches same keyword for different products", () => {
    const entries: KeywordEntry[] = [
      { keyword: "productivity", productId: "prod-1" },
      { keyword: "productivity", productId: "prod-2" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("productivity tips");

    expect(results.length).toBe(2);
    expect(results.map(r => r.productId).sort()).toEqual(["prod-1", "prod-2"]);
  });

  test("returns empty array when no match", () => {
    const entries: KeywordEntry[] = [
      { keyword: "hello", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("goodbye world");

    expect(results.length).toBe(0);
  });

  test("is case insensitive", () => {
    const entries: KeywordEntry[] = [
      { keyword: "Hello", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("HELLO world");

    expect(results.length).toBe(1);
  });

  test("deduplicates matches per product-keyword pair", () => {
    const entries: KeywordEntry[] = [
      { keyword: "task", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("task task task");

    expect(results.length).toBe(1);
  });

  test("matches overlapping patterns", () => {
    const entries: KeywordEntry[] = [
      { keyword: "project management", productId: "prod-1" },
      { keyword: "management", productId: "prod-2" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("project management tools");

    expect(results.length).toBe(2);
  });

  test("matches keyword at end of text", () => {
    const entries: KeywordEntry[] = [
      { keyword: "tools", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("productivity tools");

    expect(results.length).toBe(1);
  });

  test("matches keyword at beginning of text", () => {
    const entries: KeywordEntry[] = [
      { keyword: "best", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("best tools ever");

    expect(results.length).toBe(1);
  });

  test("handles empty keyword list", () => {
    const matcher = new AhoCorasick([]);
    const results = matcher.match("hello world");

    expect(results.length).toBe(0);
  });

  test("handles empty text", () => {
    const entries: KeywordEntry[] = [
      { keyword: "hello", productId: "prod-1" },
    ];
    const matcher = new AhoCorasick(entries);
    const results = matcher.match("");

    expect(results.length).toBe(0);
  });
});

describe("buildMatcher", () => {
  test("creates AhoCorasick instance", () => {
    const entries: KeywordEntry[] = [
      { keyword: "test", productId: "prod-1" },
    ];
    const matcher = buildMatcher(entries);

    expect(matcher).toBeInstanceOf(AhoCorasick);
  });

  test("returned matcher works correctly", () => {
    const entries: KeywordEntry[] = [
      { keyword: "task management", productId: "prod-1" },
      { keyword: "coding tools", productId: "prod-2" },
    ];
    const matcher = buildMatcher(entries);

    const results1 = matcher.match("I need task management software");
    expect(results1.length).toBe(1);
    expect(results1[0].productId).toBe("prod-1");

    const results2 = matcher.match("Looking for coding tools");
    expect(results2.length).toBe(1);
    expect(results2[0].productId).toBe("prod-2");

    const results3 = matcher.match("task management and coding tools");
    expect(results3.length).toBe(2);
  });
});
