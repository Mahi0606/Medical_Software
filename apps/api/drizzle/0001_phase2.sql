CREATE TABLE `interaction_rule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`salt_a` text NOT NULL,
	`salt_b` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`advice` text,
	`source` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interaction_a_idx` ON `interaction_rule` (`salt_a`);--> statement-breakpoint
CREATE INDEX `interaction_b_idx` ON `interaction_rule` (`salt_b`);--> statement-breakpoint
CREATE TABLE `message_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`to_phone` text NOT NULL,
	`template_key` text NOT NULL,
	`body` text NOT NULL,
	`media_url` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider_message_id` text,
	`error` text,
	`related_type` text,
	`related_id` integer,
	`customer_id` integer,
	`scheduled_for` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `outbox_status_idx` ON `message_outbox` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE INDEX `outbox_related_idx` ON `message_outbox` (`related_type`,`related_id`);--> statement-breakpoint
CREATE TABLE `purchase_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`po_no` text,
	`supplier_id` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`date` text NOT NULL,
	`expected_date` text,
	`notes` text,
	`estimated_paise` integer DEFAULT 0 NOT NULL,
	`sent_at` text,
	`sent_via` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`cancel_reason` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `po_supplier_idx` ON `purchase_order` (`supplier_id`,`status`);--> statement-breakpoint
CREATE TABLE `purchase_order_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_order_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty_packs` integer NOT NULL,
	`rate_paise` integer,
	`mrp_paise` integer,
	`received_packs` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `po_line_po_idx` ON `purchase_order_line` (`purchase_order_id`);--> statement-breakpoint
ALTER TABLE `purchase` ADD `purchase_order_id` integer;--> statement-breakpoint
ALTER TABLE `sale` ADD `offline` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sale` ADD `client_posted_at` text;--> statement-breakpoint
ALTER TABLE `sale` ADD `synced_at` text;--> statement-breakpoint
ALTER TABLE `sale` ADD `refill_days` integer;--> statement-breakpoint
ALTER TABLE `sale` ADD `refill_due_date` text;--> statement-breakpoint
ALTER TABLE `sale` ADD `interaction_override` text;