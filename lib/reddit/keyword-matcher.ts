interface TrieNode {
  children: Map<string, TrieNode>;
  fail: TrieNode | null;
  output: Array<{ keyword: string; productId: string }>;
}

function createNode(): TrieNode {
  return {
    children: new Map(),
    fail: null,
    output: [],
  };
}

export interface KeywordEntry {
  keyword: string;
  productId: string;
}

export interface MatchResult {
  keyword: string;
  productId: string;
}

export class AhoCorasick {
  private root: TrieNode;

  constructor(entries: KeywordEntry[]) {
    this.root = createNode();
    this.buildTrie(entries);
    this.buildFailureLinks();
  }

  private buildTrie(entries: KeywordEntry[]): void {
    for (const entry of entries) {
      let node = this.root;
      const keyword = entry.keyword.toLowerCase();

      for (const char of keyword) {
        if (!node.children.has(char)) {
          node.children.set(char, createNode());
        }
        node = node.children.get(char)!;
      }

      node.output.push({
        keyword: entry.keyword,
        productId: entry.productId,
      });
    }
  }

  private buildFailureLinks(): void {
    const queue: TrieNode[] = [];
    this.root.fail = this.root;

    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [char, child] of current.children) {
        queue.push(child);

        let failure = current.fail!;
        while (failure !== this.root && !failure.children.has(char)) {
          failure = failure.fail!;
        }

        child.fail = failure.children.get(char) ?? this.root;
        if (child.fail === child) {
          child.fail = this.root;
        }

        child.output = [...child.output, ...child.fail.output];
      }
    }
  }

  match(text: string): MatchResult[] {
    const results: MatchResult[] = [];
    const seen = new Set<string>();
    let node = this.root;
    const lowerText = text.toLowerCase();

    for (const char of lowerText) {
      while (node !== this.root && !node.children.has(char)) {
        node = node.fail!;
      }
      node = node.children.get(char) ?? this.root;

      for (const entry of node.output) {
        const key = `${entry.productId}:${entry.keyword}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(entry);
        }
      }
    }

    return results;
  }
}

export function buildMatcher(entries: KeywordEntry[]): AhoCorasick {
  return new AhoCorasick(entries);
}
