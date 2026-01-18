export interface KeywordMatch {
  keyword: string;
  productId: string;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  fail: TrieNode | null;
  output: KeywordMatch[];
}

function createNode(): TrieNode {
  return { children: new Map(), fail: null, output: [] };
}

export class AhoCorasick {
  private root: TrieNode;

  constructor(entries: KeywordMatch[]) {
    this.root = createNode();
    this.buildTrie(entries);
    this.buildFailureLinks();
  }

  private buildTrie(entries: KeywordMatch[]): void {
    for (const entry of entries) {
      let node = this.root;
      for (const char of entry.keyword.toLowerCase()) {
        let child = node.children.get(char);
        if (!child) {
          child = createNode();
          node.children.set(char, child);
        }
        node = child;
      }
      node.output.push(entry);
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

        let fail = current.fail!;
        while (fail !== this.root && !fail.children.has(char)) {
          fail = fail.fail!;
        }

        const failChild = fail.children.get(char);
        child.fail = failChild && failChild !== child ? failChild : this.root;
        child.output.push(...child.fail.output);
      }
    }
  }

  match(text: string): KeywordMatch[] {
    const results: KeywordMatch[] = [];
    const seen = new Set<string>();
    let node = this.root;

    for (const char of text.toLowerCase()) {
      while (node !== this.root && !node.children.has(char)) {
        node = node.fail!;
      }
      node = node.children.get(char) ?? this.root;

      for (const match of node.output) {
        const key = `${match.productId}:${match.keyword}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push(match);
        }
      }
    }

    return results;
  }
}

export function buildMatcher(entries: KeywordMatch[]): AhoCorasick {
  return new AhoCorasick(entries);
}
