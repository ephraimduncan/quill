import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "@/lib/auth/schema";

export * from "@/lib/auth/schema";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  url: text("url").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  targetAudience: text("target_audience").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const keywords = sqliteTable("keywords", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  keyword: text("keyword").notNull(),
});

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  redditThreadId: text("reddit_thread_id").notNull(),
  title: text("title").notNull(),
  bodyPreview: text("body_preview").notNull(),
  subreddit: text("subreddit").notNull(),
  url: text("url").notNull(),
  createdUtc: integer("created_utc").notNull(),
  discoveredAt: integer("discovered_at").notNull(),
  status: text("status", { enum: ["active", "dismissed"] })
    .notNull()
    .default("active"),
  isNew: integer("is_new", { mode: "boolean" }).notNull().default(true),
});

export const postHistory = sqliteTable("post_history", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  threadId: text("thread_id")
    .notNull()
    .references(() => threads.id),
  responseSnippet: text("response_snippet").notNull(),
  redditCommentUrl: text("reddit_comment_url").notNull(),
  postedAt: integer("posted_at").notNull(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Keyword = typeof keywords.$inferSelect;
export type NewKeyword = typeof keywords.$inferInsert;
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
export type PostHistory = typeof postHistory.$inferSelect;
export type NewPostHistory = typeof postHistory.$inferInsert;
