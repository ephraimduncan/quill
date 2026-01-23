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
  batchFetchComments,
  generateNextIdRange,
  base36ToNumber,
  isPostRemovedOrDeleted,
  isCommentRemovedOrDeleted,
  type RedditPost,
  type RedditComment,
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
const { keywords, threads, redditSyncState, blockedAuthors } = schema;

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

    const allBlockedAuthors = await db
      .select({ username: blockedAuthors.username, productId: blockedAuthors.productId })
      .from(blockedAuthors);
    const blockedByProduct = new Map<string, Set<string>>();
    for (const ba of allBlockedAuthors) {
      if (!blockedByProduct.has(ba.productId)) {
        blockedByProduct.set(ba.productId, new Set());
      }
      blockedByProduct.get(ba.productId)!.add(ba.username.toLowerCase());
    }
    console.log(`[Cron] Loaded ${allBlockedAuthors.length} blocked authors across products`);

    // Generate next 3000 IDs by incrementing (F5Bot approach)
    const idsToFetch = generateNextIdRange(lastPostId, 3000);
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
      if (isPostRemovedOrDeleted(post)) continue;

      const textToMatch = `${post.title} ${post.selftext}`;
      const matches = matcher.match(textToMatch);
      const authorLower = post.author.toLowerCase();

      for (const match of matches) {
        const blocked = blockedByProduct.get(match.productId);
        if (blocked?.has(authorLower)) continue;

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
      console.log(`[Cron] Inserted ${threadsToInsert.length} new post threads`);
    }

    // Comment discovery
    const DEFAULT_COMMENT_START_ID = "o0v5dc2";
    const lastCommentId = syncState?.lastCommentId ?? DEFAULT_COMMENT_START_ID;
    console.log(`[Cron] Starting comment discovery from ID: ${lastCommentId}`);

    const commentIdsToFetch = generateNextIdRange(lastCommentId, 3000);
    console.log(`[Cron] Fetching ${commentIdsToFetch.length} comment IDs...`);

    const allComments: RedditComment[] = [];
    for (let i = 0; i < commentIdsToFetch.length; i += 100) {
      const chunk = commentIdsToFetch.slice(i, i + 100);
      const comments = await batchFetchComments(chunk);
      allComments.push(...comments);
    }

    console.log(`[Cron] Fetched ${allComments.length} comments from Reddit API`);

    if (allComments.length === 0) {
      console.warn("[Cron] WARNING: Got 0 comments from Reddit API - possible IP blocking or rate limiting");
    }

    let highestCommentId = lastCommentId;
    for (const comment of allComments) {
      if (base36ToNumber(comment.id) > base36ToNumber(highestCommentId)) {
        highestCommentId = comment.id;
      }
    }

    const commentThreadsToInsert: Array<{
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
      type: "comment";
      commentBody: string;
      parentPostId: string;
      parentPostTitle: string;
    }> = [];

    for (const comment of allComments) {
      if (comment.created_utc < thirtyDaysAgo) continue;
      if (isCommentRemovedOrDeleted(comment)) continue;

      const matches = matcher.match(comment.body);
      const authorLower = comment.author.toLowerCase();

      for (const match of matches) {
        const blocked = blockedByProduct.get(match.productId);
        if (blocked?.has(authorLower)) continue;

        const key = `${match.productId}:${comment.id}`;
        if (existingSet.has(key)) continue;
        existingSet.add(key);

        const parentPostId = comment.link_id.replace("t3_", "");

        commentThreadsToInsert.push({
          id: randomUUID(),
          productId: match.productId,
          redditThreadId: comment.id,
          title: comment.link_title || "[Comment]",
          bodyPreview: comment.body.slice(0, 200),
          subreddit: comment.subreddit,
          url: `https://reddit.com${comment.permalink}`,
          createdUtc: comment.created_utc,
          discoveredAt: now,
          status: "active",
          isNew: true,
          matchedKeyword: match.keyword,
          type: "comment",
          commentBody: comment.body,
          parentPostId,
          parentPostTitle: comment.link_title || "",
        });
      }
    }

    if (commentThreadsToInsert.length > 0) {
      await db.insert(threads).values(commentThreadsToInsert);
      console.log(`[Cron] Inserted ${commentThreadsToInsert.length} new comment threads`);
    }

    // Update sync state with highest found IDs
    if (!syncState) {
      await db.insert(redditSyncState).values({
        id: "global",
        lastPostId: highestId,
        lastCommentId: highestCommentId,
        updatedAt: now,
      });
    } else {
      await db
        .update(redditSyncState)
        .set({ lastPostId: highestId, lastCommentId: highestCommentId, updatedAt: now })
        .where(eq(redditSyncState.id, "global"));
    }

    const duration = Date.now() - startTime;
    console.log(`[Cron] Completed in ${duration}ms`, {
      postsProcessed: allPosts.length,
      commentsProcessed: allComments.length,
      newPostThreadsFound: threadsToInsert.length,
      newCommentThreadsFound: commentThreadsToInsert.length,
      lastPostId: highestId,
      lastCommentId: highestCommentId,
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
