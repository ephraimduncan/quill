export interface KeywordMatch {
  keyword: string;
  productId: string;
}

interface KeywordEntry extends KeywordMatch {
  words: string[];
  patterns: RegExp[];
}

function createWordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`, "i");
}

export class KeywordMatcher {
  private entries: KeywordEntry[];

  constructor(keywords: KeywordMatch[]) {
    this.entries = keywords.map((k) => {
      const words = k.keyword.toLowerCase().split(/\s+/).filter(Boolean);
      return {
        ...k,
        words,
        patterns: words.map(createWordPattern),
      };
    });
  }

  match(text: string): KeywordMatch[] {
    const results: KeywordMatch[] = [];
    const seen = new Set<string>();

    for (const entry of this.entries) {
      const allWordsFound = entry.patterns.every((pattern) => pattern.test(text));
      if (allWordsFound) {
        const key = `${entry.productId}:${entry.keyword}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ keyword: entry.keyword, productId: entry.productId });
        }
      }
    }

    return results;
  }
}

export function buildMatcher(entries: KeywordMatch[]): KeywordMatcher {
  return new KeywordMatcher(entries);
}
