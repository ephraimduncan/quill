const BASE36_CHARS = "0123456789abcdefghijklmnopqrstuvwxyz";
const REDDIT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; QuillRedditAgent/1.0; +https://reddit-agent.vercel.app)",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

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

// Generate IDs by incrementing from the last known ID (F5Bot approach)
export function generateNextIdRange(
  lastId: string,
  count = 500
): string[] {
  const start = base36ToNumber(lastId);
  const ids: string[] = [];
  
  for (let i = 1n; i <= BigInt(count); i++) {
    ids.push(numberToBase36(start + i));
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

export interface RedditComment {
  id: string;
  body: string;
  subreddit: string;
  permalink: string;
  created_utc: number;
  link_id: string;
  link_title: string;
}

interface RedditApiChild<T = RedditPost> {
  kind: string;
  data: T;
}

export async function fetchLatestPostId(): Promise<string | null> {
  const url = "https://www.reddit.com/r/all/new/.json?limit=1&raw_json=1";
  console.log("[Reddit] Fetching latest post ID...");
  
  try {
    const res = await fetch(url, { headers: REDDIT_HEADERS });
    
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Reddit] fetchLatestPostId failed: ${res.status} ${res.statusText}`, {
        responseBody: body.slice(0, 500),
      });
      return null;
    }

    const data = await res.json();
    const id = data?.data?.children?.[0]?.data?.id ?? null;
    console.log(`[Reddit] Latest post ID: ${id}`);
    return id;
  } catch (error) {
    console.error("[Reddit] fetchLatestPostId error:", error);
    return null;
  }
}

export async function batchFetchPosts(ids: string[]): Promise<RedditPost[]> {
  if (ids.length === 0) return [];

  const fullnames = ids.map((id) => `t3_${id}`).join(",");
  const url = `https://api.reddit.com/api/info.json?id=${fullnames}&raw_json=1`;

  console.log(`[Reddit] Fetching batch of ${ids.length} posts...`);

  try {
    const res = await fetch(url, { headers: REDDIT_HEADERS });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Reddit] batchFetchPosts failed: ${res.status} ${res.statusText}`, {
        idsCount: ids.length,
        responseBody: body.slice(0, 500),
      });
      return [];
    }

    const data = await res.json();
    const children: RedditApiChild<RedditPost>[] = data?.data?.children ?? [];
    const posts = children
      .filter((child) => child.kind === "t3")
      .map((child) => child.data);

    console.log(`[Reddit] Got ${posts.length} posts from batch of ${ids.length}`);
    return posts;
  } catch (error) {
    console.error("[Reddit] batchFetchPosts error:", error);
    return [];
  }
}

export async function batchFetchComments(ids: string[]): Promise<RedditComment[]> {
  if (ids.length === 0) return [];

  const fullnames = ids.map((id) => `t1_${id}`).join(",");
  const url = `https://api.reddit.com/api/info.json?id=${fullnames}&raw_json=1`;

  console.log(`[Reddit] Fetching batch of ${ids.length} comments...`);

  try {
    const res = await fetch(url, { headers: REDDIT_HEADERS });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[Reddit] batchFetchComments failed: ${res.status} ${res.statusText}`, {
        idsCount: ids.length,
        responseBody: body.slice(0, 500),
      });
      return [];
    }

    const data = await res.json();
    const children: RedditApiChild<RedditComment>[] = data?.data?.children ?? [];
    const comments = children
      .filter((child) => child.kind === "t1")
      .map((child) => child.data);

    console.log(`[Reddit] Got ${comments.length} comments from batch of ${ids.length}`);
    return comments;
  } catch (error) {
    console.error("[Reddit] batchFetchComments error:", error);
    return [];
  }
}
