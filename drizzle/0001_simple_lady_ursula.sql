CREATE TABLE `arena_flavors` (
	`key` text PRIMARY KEY NOT NULL,
	`sabor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `print_templates` (
	`print_id` text NOT NULL,
	`face` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`print_id`, `face`)
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`name_en` text NOT NULL,
	`source` text NOT NULL,
	`nome` text NOT NULL,
	`tipo` text NOT NULL,
	`texto` text NOT NULL,
	`sabor` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	PRIMARY KEY(`name_en`, `source`)
);
--> statement-breakpoint
ALTER TABLE `order_items` ADD `translated` integer DEFAULT false NOT NULL;