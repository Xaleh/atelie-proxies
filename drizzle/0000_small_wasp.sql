CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`game` text DEFAULT 'mtg' NOT NULL,
	`print_id` text NOT NULL,
	`oracle_id` text NOT NULL,
	`name` text NOT NULL,
	`printed_name` text,
	`set_code` text NOT NULL,
	`collector_number` text NOT NULL,
	`lang` text NOT NULL,
	`image` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'recebido' NOT NULL,
	`customer_name` text NOT NULL,
	`customer_contact` text NOT NULL,
	`delivery` text NOT NULL,
	`cep` text,
	`address` text,
	`notes` text,
	`quantity` integer NOT NULL,
	`unit_cents` integer NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`shipping_cents` integer NOT NULL,
	`total_cents` integer NOT NULL,
	`payment_method` text,
	`tracking` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`paid_at` text,
	`shipped_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_idx` ON `orders` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_token_idx` ON `orders` (`token`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_payment_id` text,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`detail` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_id_idx` ON `payments` (`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`order_id`);