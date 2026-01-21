ALTER TABLE `reddit_sync_state` ADD `last_comment_id` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `type` text DEFAULT 'post';--> statement-breakpoint
ALTER TABLE `threads` ADD `comment_body` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `parent_post_id` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `parent_post_title` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `generated_response` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `custom_instructions` text;--> statement-breakpoint
ALTER TABLE `threads` ADD `relevance_score` integer;