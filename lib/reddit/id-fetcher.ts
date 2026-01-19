const BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const REDDIT_HEADERS = { "User-Agent": "QuillRedditAgent/1.0" };

export function base36ToNumber(id: string): bigint {
  let result = 0n;
  for (const char of id.toLowerCase()) {
    const value = BASE36_CHARS.indexOf(char);
    if (value === -1) throw new Error(`Invalid base36 character: ${char}`);
    result = result * 36n + BigInt(value);
  }
  return result;
}

export function numberToBase36(num: bigint): string {
  if (num === 0n) return "0";
  let result = "";
  let n = num;
  while (n > 0) {
    result = BASE36_CHARS[Number(n % 36n)] + result;
    n = n / 36n;
  }
  return result;
}

export function generateIdRange(
  startId: string,
  endId: string,
  maxCount = 100
): string[] {
  const start = base36ToNumber(startId);
  const end = base36ToNumber(endId);
  if (end <= start) return [];

  const ids: string[] = [];
  const count = end - start;
  const limit = count > BigInt(maxCount) ? BigInt(maxCount) : count;

  for (let i = 0n; i < limit; i++) {
    ids.push(numberToBase36(end - i));
  }
  return ids;
}

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
}

interface RedditApiChild {
  kind: string;
  data: RedditPost;
}

export async function fetchLatestPostId(): Promise<string | null> {
  const res = await fetch(
    "https://www.reddit.com/r/all/new.json?limit=1&raw_json=1",
    { headers: REDDIT_HEADERS }
  );
  if (!res.ok) return null;

  const data = await res.json();
  return data?.data?.children?.[0]?.data?.id ?? null;
}

export async function batchFetchPosts(ids: string[]): Promise<RedditPost[]> {
  if (ids.length === 0) return [];

  const fullnames = ids.map((id) => `t3_${id}`).join(",");
  const res = await fetch(
    `https://api.reddit.com/api/info.json?id=${fullnames}&raw_json=1`,
    { headers: REDDIT_HEADERS }
  );
  if (!res.ok) return [];

  const data = await res.json();
  const children: RedditApiChild[] = data?.data?.children ?? [];

  return children
    .filter((child) => child.kind === "t3")
    .map((child) => child.data);
}
