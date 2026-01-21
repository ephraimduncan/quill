/**
 * Standalone Reddit Discovery Cron Job
 * 
 * This script can be run on an external server (Railway, Fly.io, VPS) to avoid
 * Reddit's IP blocking of Vercel's serverless functions.
 * 
 * Usage:
 *   npx tsx cron-worker/discover.ts
 * 
 * Required environment variables:
 *   - TURSO_DATABASE_URL
 *   - TURSO_AUTH_TOKEN
 * 
 * Deploy to Railway/Fly.io with a cron schedule (e.g., every 2 minutes)
 */

import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../lib/db/schema";
import {
  batchFetchPosts,
  generateNextIdRange,
  base36ToNumber,
  type RedditPost,
} from "../lib/reddit/id-fetcher";
import { buildMatcher, type KeywordMatch } from "../lib/reddit/keyword-matcher";

// Initialize database connection
const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("[Cron] TURSO_DATABASE_URL environment variable is required");
  process.exit(1);
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });
const { keywords, threads, redditSyncState } = schema;

async function runDiscovery(): Promise<void> {
  const startTime = Date.now();
  console.log("[Cron] Starting discover job...");
  console.log(`[Cron] Time: ${new Date().toISOString()}`);

  try {
    const [syncState] = await db
      .select()
      .from(redditSyncState)
      .where(eq(redditSyncState.id, "global"));

    // Initialize with a recent ID if first run
    // Update this to a recent Reddit post ID if needed
    const DEFAULT_START_ID = "1i5abc";
    const lastPostId = syncState?.lastPostId ?? DEFAULT_START_ID;
    console.log(`[Cron] Starting from post ID: ${lastPostId}`);

    const allKeywords = await db
      .select({ keyword: keywords.keyword, productId: keywords.productId })
      .from(keywords);

    if (allKeywords.length === 0) {
      console.log("[Cron] No keywords configured, skipping");
      const now = Math.floor(Date.now() / 1000);
      if (!syncState) {
        await db.insert(redditSyncState).values({
          id: "global",
          lastPostId: lastPostId,
          updatedAt: now,
        });
      }
      console.log("[Cron] Done (no keywords)");
      return;
    }

    console.log(`[Cron] Monitoring ${allKeywords.length} keywords`);

    const keywordEntries: KeywordMatch[] = allKeywords.map((k) => ({
      keyword: k.keyword,
      productId: k.productId,
    }));
    const matcher = buildMatcher(keywordEntries);

    // Generate next 2000 IDs by incrementing (F5Bot approach)
    const idsToFetch = generateNextIdRange(lastPostId, 2000);
    console.log(`[Cron] Fetching ${idsToFetch.length} post IDs...`);

    // Batch fetch in chunks of 100
    const allPosts: RedditPost[] = [];
    for (let i = 0; i < idsToFetch.length; i += 100) {
      const chunk = idsToFetch.slice(i, i + 100);
      const posts = await batchFetchPosts(chunk);
      allPosts.push(...posts);
    }

    console.log(`[Cron] Fetched ${allPosts.length} posts from Reddit API`);

    // Warn if we got zero posts - likely indicates API blocking
    if (allPosts.length === 0) {
      console.warn(
        "[Cron] WARNING: Got 0 posts from Reddit API - possible IP blocking or rate limiting"
      );
    }

    // Find highest ID that returned data
    let highestId = lastPostId;
    for (const post of allPosts) {
      if (base36ToNumber(post.id) > base36ToNumber(highestId)) {
        highestId = post.id;
      }
    }

    const existingThreads = await db
      .select({
        redditThreadId: threads.redditThreadId,
        productId: threads.productId,
      })
      .from(threads);
    const existingSet = new Set(
      existingThreads.map((t) => `${t.productId}:${t.redditThreadId}`)
    );

    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    const threadsToInsert: Array<{
      id: string;
      productId: string;
      redditThreadId: string;
      title: string;
      bodyPreview: string;
      subreddit: string;
      url: string;
      createdUtc: number;
      discoveredAt: number;
      status: "active";
      isNew: true;
      matchedKeyword: string;
    }> = [];

    for (const post of allPosts) {
      if (post.created_utc < thirtyDaysAgo) continue;

      const textToMatch = `${post.title} ${post.selftext}`;
      const matches = matcher.match(textToMatch);

      for (const match of matches) {
        const key = `${match.productId}:${post.id}`;
        if (existingSet.has(key)) continue;
        existingSet.add(key);

        threadsToInsert.push({
          id: randomUUID(),
          productId: match.productId,
          redditThreadId: post.id,
          title: post.title,
          bodyPreview: post.selftext.slice(0, 200),
          subreddit: post.subreddit,
          url: `https://reddit.com${post.permalink}`,
          createdUtc: post.created_utc,
          discoveredAt: now,
          status: "active",
          isNew: true,
          matchedKeyword: match.keyword,
        });
      }
    }

    if (threadsToInsert.length > 0) {
      await db.insert(threads).values(threadsToInsert);
      console.log(`[Cron] Inserted ${threadsToInsert.length} new threads`);
    }

    // Update sync state with highest found ID
    if (!syncState) {
      await db.insert(redditSyncState).values({
        id: "global",
        lastPostId: highestId,
        updatedAt: now,
      });
    } else {
      await db
        .update(redditSyncState)
        .set({ lastPostId: highestId, updatedAt: now })
        .where(eq(redditSyncState.id, "global"));
    }

    const duration = Date.now() - startTime;
    console.log(`[Cron] Completed in ${duration}ms`, {
      postsProcessed: allPosts.length,
      newThreadsFound: threadsToInsert.length,
      lastPostId: highestId,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Cron] Fatal error after ${duration}ms:`, error);
    process.exit(1);
  }
}

// Run the discovery
runDiscovery()
  .then(() => {
    console.log("[Cron] Job finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[Cron] Unhandled error:", error);
    process.exit(1);
  });
