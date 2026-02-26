CREATE UNIQUE INDEX `threads_product_reddit_idx` ON `threads` (`product_id`,`reddit_thread_id`);--> statement-breakpoint
CREATE INDEX `threads_product_id_idx` ON `threads` (`product_id`);