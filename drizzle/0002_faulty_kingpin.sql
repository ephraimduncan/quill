CREATE TABLE `blocked_authors` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`username` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `global_blocked_authors` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
