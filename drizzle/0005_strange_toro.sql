CREATE TABLE `card_fonts` (
	`slot` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	`hash` text NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
