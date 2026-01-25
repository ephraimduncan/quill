import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "@/lib/auth/schema";

export * from "@/lib/auth/schema";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  url: text("url").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  targetAudience: text("target_audience").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const keywords = sqliteTable("keywords", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
});

export const blockedAuthors = sqliteTable("blocked_authors", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
});

export const globalBlockedAuthors = sqliteTable("global_blocked_authors", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  redditThreadId: text("reddit_thread_id").notNull(),
  title: text("title").notNull(),
  bodyPreview: text("body_preview").notNull(),
  subreddit: text("subreddit").notNull(),
  url: text("url").notNull(),
  createdUtc: integer("created_utc").notNull(),
  discoveredAt: integer("discovered_at").notNull(),
  status: text("status", { enum: ["active", "dismissed"] }).notNull().default("active"),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(true),
  matchedKeyword: text("matched_keyword"),
  type: text("type", { enum: ["post", "comment"] }).default("post"),
  commentBody: text("comment_body"),
  parentPostId: text("parent_post_id"),
  parentPostTitle: text("parent_post_title"),
  generatedResponse: text("generated_response"),
  customInstructions: text("custom_instructions"),
  relevanceScore: integer("relevance_score"),
});

export const redditSyncState = sqliteTable("reddit_sync_state", {
  id: text("id").primaryKey().default("global"),
  lastPostId: text("last_post_id").notNull(),
  lastCommentId: text("last_comment_id"),
  updatedAt: integer("updated_at").notNull(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type BlockedAuthor = typeof blockedAuthors.$inferSelect;
export type NewBlockedAuthor = typeof blockedAuthors.$inferInsert;
export type GlobalBlockedAuthor = typeof globalBlockedAuthors.$inferSelect;
export type NewGlobalBlockedAuthor = typeof globalBlockedAuthors.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type RedditSyncState = typeof redditSyncState.$inferSelect;
export type NewRedditSyncState = typeof redditSyncState.$inferInsert;
