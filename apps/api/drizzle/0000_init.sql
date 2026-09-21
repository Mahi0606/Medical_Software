CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`user_id` integer,
	`username` text,
	`entity` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`reason` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE TABLE `backup_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`ok` integer NOT NULL,
	`note` text,
	`triggered_by` text DEFAULT 'scheduler' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `batch` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`item_id` integer NOT NULL,
	`batch_no` text NOT NULL,
	`mfg_date` text,
	`expiry_date` text NOT NULL,
	`mrp_paise` integer NOT NULL,
	`purchase_rate_paise` integer DEFAULT 0 NOT NULL,
	`supplier_id` integer,
	`gtin` text,
	`status` text DEFAULT 'active' NOT NULL,
	`qty_units` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `batch_item_idx` ON `batch` (`item_id`,`expiry_date`);--> statement-breakpoint
CREATE INDEX `batch_expiry_idx` ON `batch` (`expiry_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `batch_unique_idx` ON `batch` (`branch_id`,`item_id`,`batch_no`,`expiry_date`,`mrp_paise`);--> statement-breakpoint
CREATE TABLE `branch` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_code_unique` ON `branch` (`code`);--> statement-breakpoint
CREATE TABLE `customer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`alt_phone` text,
	`address` text,
	`city` text,
	`gstin` text,
	`dob` text,
	`is_minor` integer DEFAULT false NOT NULL,
	`guardian_name` text,
	`consent_marketing` integer DEFAULT false NOT NULL,
	`credit_limit_paise` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customer_phone_idx` ON `customer` (`phone`);--> statement-breakpoint
CREATE TABLE `doc_sequence` (
	`branch_id` integer NOT NULL,
	`doc_type` text NOT NULL,
	`fy` text NOT NULL,
	`last` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`branch_id`, `doc_type`, `fy`)
);
--> statement-breakpoint
CREATE TABLE `doctor` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`reg_no` text,
	`council` text,
	`qualification` text,
	`phone` text,
	`address` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `duty_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`user_id` integer NOT NULL,
	`on_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`off_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `duty_open_idx` ON `duty_log` (`branch_id`,`off_at`);--> statement-breakpoint
CREATE TABLE `item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`form` text DEFAULT 'tablet' NOT NULL,
	`manufacturer_id` integer,
	`generic_text` text DEFAULT '' NOT NULL,
	`generic_norm` text DEFAULT '' NOT NULL,
	`hsn` text DEFAULT '3004' NOT NULL,
	`gst_rate_pct` integer DEFAULT 5 NOT NULL,
	`schedule` text DEFAULT 'NONE' NOT NULL,
	`base_unit` text DEFAULT 'tablet' NOT NULL,
	`units_per_pack` integer DEFAULT 10 NOT NULL,
	`pack_name` text DEFAULT 'strip' NOT NULL,
	`packs_per_box` integer,
	`allow_loose` integer DEFAULT true NOT NULL,
	`rack` text,
	`min_stock_units` integer DEFAULT 0 NOT NULL,
	`max_stock_units` integer DEFAULT 0 NOT NULL,
	`reorder_qty_packs` integer DEFAULT 0 NOT NULL,
	`ean` text,
	`cold_chain` integer DEFAULT false NOT NULL,
	`not_for_sale` integer DEFAULT false NOT NULL,
	`narcotic` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`manufacturer_id`) REFERENCES `manufacturer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `item_name_norm_idx` ON `item` (`name_norm`);--> statement-breakpoint
CREATE INDEX `item_generic_norm_idx` ON `item` (`generic_norm`);--> statement-breakpoint
CREATE INDEX `item_ean_idx` ON `item` (`ean`);--> statement-breakpoint
CREATE INDEX `item_rack_idx` ON `item` (`rack`);--> statement-breakpoint
CREATE TABLE `item_salt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`salt` text NOT NULL,
	`salt_norm` text NOT NULL,
	`strength` text,
	`unit` text,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_salt_item_idx` ON `item_salt` (`item_id`);--> statement-breakpoint
CREATE INDEX `item_salt_norm_idx` ON `item_salt` (`salt_norm`);--> statement-breakpoint
CREATE TABLE `item_schedule_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`schedule` text NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `label_job` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`payload_json` text NOT NULL,
	`label_count` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `label_template` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`width_mm_x10` integer NOT NULL,
	`height_mm_x10` integer NOT NULL,
	`columns` integer DEFAULT 1 NOT NULL,
	`gap_mm_x10` integer DEFAULT 30 NOT NULL,
	`margin_mm_x10` integer DEFAULT 15 NOT NULL,
	`font_scale_x100` integer DEFAULT 100 NOT NULL,
	`symbology` text DEFAULT 'code128' NOT NULL,
	`barcode_content` text DEFAULT 'batch' NOT NULL,
	`fields_json` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `licence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`type` text NOT NULL,
	`number` text NOT NULL,
	`issued_by` text,
	`issued_on` text,
	`valid_till` text,
	`retention_fee_due` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manufacturer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manufacturer_name_unique` ON `manufacturer` (`name`);--> statement-breakpoint
CREATE TABLE `party_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_type` text NOT NULL,
	`party_id` integer NOT NULL,
	`date` text NOT NULL,
	`doc_type` text NOT NULL,
	`doc_id` integer,
	`doc_no` text,
	`debit_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `party_ledger_idx` ON `party_ledger` (`party_type`,`party_id`,`date`);--> statement-breakpoint
CREATE TABLE `party_payment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`party_type` text NOT NULL,
	`party_id` integer NOT NULL,
	`date` text NOT NULL,
	`mode` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reference` text,
	`note` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prescription_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`path` text NOT NULL,
	`uploaded_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `purchase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`grn_no` text,
	`supplier_id` integer NOT NULL,
	`invoice_no` text NOT NULL,
	`invoice_date` text NOT NULL,
	`received_date` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`interstate` integer DEFAULT false NOT NULL,
	`taxable_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`other_charges_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`posted_at` text,
	`cancelled_at` text,
	`cancel_reason` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_supplier_idx` ON `purchase` (`supplier_id`,`invoice_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchase_inv_unique` ON `purchase` (`supplier_id`,`invoice_no`);--> statement-breakpoint
CREATE TABLE `purchase_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`batch_id` integer,
	`batch_no` text NOT NULL,
	`mfg_date` text,
	`expiry_date` text NOT NULL,
	`qty_packs` integer NOT NULL,
	`free_packs` integer DEFAULT 0 NOT NULL,
	`units_per_pack` integer NOT NULL,
	`rate_paise` integer NOT NULL,
	`discount_pct_x100` integer DEFAULT 0 NOT NULL,
	`mrp_paise` integer NOT NULL,
	`gst_rate_pct` integer NOT NULL,
	`hsn` text NOT NULL,
	`taxable_paise` integer NOT NULL,
	`cgst_paise` integer NOT NULL,
	`sgst_paise` integer NOT NULL,
	`igst_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	`scheme_note` text,
	`gtin` text,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchase`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purchase_line_purchase_idx` ON `purchase_line` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `purchase_line_item_idx` ON `purchase_line` (`item_id`);--> statement-breakpoint
CREATE TABLE `purchase_return` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`doc_no` text,
	`supplier_id` integer NOT NULL,
	`date` text NOT NULL,
	`route` text NOT NULL,
	`supplier_ref` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`taxable_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`itc_reversal_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`cancelled_at` text,
	`cancel_reason` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchase_return_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_return_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`qty_units` integer NOT NULL,
	`rate_paise` integer NOT NULL,
	`gst_rate_pct` integer NOT NULL,
	`taxable_paise` integer NOT NULL,
	`tax_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	`reason` text NOT NULL,
	FOREIGN KEY (`purchase_return_id`) REFERENCES `purchase_return`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rx_register` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`register` text NOT NULL,
	`fy` text NOT NULL,
	`serial_no` integer NOT NULL,
	`date` text NOT NULL,
	`sale_id` integer NOT NULL,
	`sale_line_id` integer NOT NULL,
	`invoice_no` text,
	`doctor_name` text,
	`doctor_address` text,
	`doctor_reg_no` text,
	`patient_name` text,
	`patient_address` text,
	`item_name` text NOT NULL,
	`generic_name` text,
	`manufacturer` text,
	`batch_no` text NOT NULL,
	`expiry_date` text NOT NULL,
	`qty_units` integer NOT NULL,
	`qty_text` text NOT NULL,
	`pharmacist_user_id` integer,
	`pharmacist_name` text,
	`pharmacist_reg_no` text,
	`prescription_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rx_register_idx` ON `rx_register` (`register`,`fy`,`serial_no`);--> statement-breakpoint
CREATE INDEX `rx_register_date_idx` ON `rx_register` (`date`);--> statement-breakpoint
CREATE TABLE `sale` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`counter` text DEFAULT 'C1' NOT NULL,
	`invoice_no` text,
	`fy` text NOT NULL,
	`kind` text DEFAULT 'TAX_INVOICE' NOT NULL,
	`date` text NOT NULL,
	`customer_id` integer,
	`customer_name` text,
	`customer_phone` text,
	`customer_gstin` text,
	`doctor_id` integer,
	`doctor_name` text,
	`doctor_reg_no` text,
	`patient_name` text,
	`patient_address` text,
	`patient_age` integer,
	`prescription_ref` text,
	`prescription_date` text,
	`prescription_image_id` integer,
	`pharmacist_user_id` integer,
	`strictest_schedule` text DEFAULT 'NONE' NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`gross_paise` integer DEFAULT 0 NOT NULL,
	`discount_paise` integer DEFAULT 0 NOT NULL,
	`bill_discount_pct_x100` integer DEFAULT 0 NOT NULL,
	`taxable_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`paid_paise` integer DEFAULT 0 NOT NULL,
	`credit_paise` integer DEFAULT 0 NOT NULL,
	`returned_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`client_ref` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`posted_at` text,
	`cancelled_at` text,
	`cancel_reason` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`doctor_id`) REFERENCES `doctor`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_client_ref_unique` ON `sale` (`client_ref`);--> statement-breakpoint
CREATE INDEX `sale_date_idx` ON `sale` (`date`);--> statement-breakpoint
CREATE INDEX `sale_customer_idx` ON `sale` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sale_invoice_unique` ON `sale` (`branch_id`,`fy`,`invoice_no`);--> statement-breakpoint
CREATE TABLE `sale_hold` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_ref` text NOT NULL,
	`label` text,
	`payload_json` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_hold_client_ref_unique` ON `sale_hold` (`client_ref`);--> statement-breakpoint
CREATE TABLE `sale_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`item_name` text NOT NULL,
	`generic_text` text,
	`manufacturer` text,
	`batch_no` text NOT NULL,
	`expiry_date` text NOT NULL,
	`hsn` text NOT NULL,
	`schedule` text NOT NULL,
	`unit_mode` text NOT NULL,
	`qty` integer NOT NULL,
	`qty_units` integer NOT NULL,
	`units_per_pack` integer NOT NULL,
	`pack_name` text NOT NULL,
	`base_unit` text NOT NULL,
	`mrp_paise` integer NOT NULL,
	`unit_price_paise` integer NOT NULL,
	`discount_pct_x100` integer DEFAULT 0 NOT NULL,
	`gross_paise` integer NOT NULL,
	`discount_paise` integer NOT NULL,
	`net_paise` integer NOT NULL,
	`gst_rate_pct` integer NOT NULL,
	`taxable_paise` integer NOT NULL,
	`cgst_paise` integer NOT NULL,
	`sgst_paise` integer NOT NULL,
	`igst_paise` integer NOT NULL,
	`cost_paise` integer DEFAULT 0 NOT NULL,
	`returned_units` integer DEFAULT 0 NOT NULL,
	`price_reason` text,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sale_line_sale_idx` ON `sale_line` (`sale_id`);--> statement-breakpoint
CREATE INDEX `sale_line_item_idx` ON `sale_line` (`item_id`);--> statement-breakpoint
CREATE INDEX `sale_line_batch_idx` ON `sale_line` (`batch_id`);--> statement-breakpoint
CREATE TABLE `sale_payment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`mode` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reference` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sale_return` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`sale_id` integer NOT NULL,
	`credit_note_no` text,
	`fy` text NOT NULL,
	`date` text NOT NULL,
	`reason` text NOT NULL,
	`refund_mode` text NOT NULL,
	`taxable_paise` integer NOT NULL,
	`cgst_paise` integer NOT NULL,
	`sgst_paise` integer NOT NULL,
	`igst_paise` integer NOT NULL,
	`total_paise` integer NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sale`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sale_return_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_return_id` integer NOT NULL,
	`sale_line_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`qty_units` integer NOT NULL,
	`net_paise` integer NOT NULL,
	`taxable_paise` integer NOT NULL,
	`cgst_paise` integer NOT NULL,
	`sgst_paise` integer NOT NULL,
	`igst_paise` integer NOT NULL,
	FOREIGN KEY (`sale_return_id`) REFERENCES `sale_return`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	`user_agent` text,
	`last_seen_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_ledger` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`branch_id` integer DEFAULT 1 NOT NULL,
	`item_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`qty_delta` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`doc_type` text,
	`doc_id` integer,
	`user_id` integer,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_batch_idx` ON `stock_ledger` (`batch_id`);--> statement-breakpoint
CREATE INDEX `ledger_item_idx` ON `stock_ledger` (`item_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ledger_doc_idx` ON `stock_ledger` (`doc_type`,`doc_id`);--> statement-breakpoint
CREATE TABLE `store` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`legal_name` text,
	`address_line1` text DEFAULT '' NOT NULL,
	`address_line2` text,
	`city` text DEFAULT '' NOT NULL,
	`state` text DEFAULT '' NOT NULL,
	`state_code` text DEFAULT '27' NOT NULL,
	`pincode` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text,
	`gstin` text,
	`gst_scheme` text DEFAULT 'regular' NOT NULL,
	`invoice_prefix` text DEFAULT 'INV' NOT NULL,
	`pharmacist_name` text,
	`pharmacist_reg_no` text,
	`pharmacist_council` text,
	`footer_note` text,
	`upi_id` text,
	`print_format` text DEFAULT 'thermal80' NOT NULL,
	`near_expiry_days` integer DEFAULT 90 NOT NULL,
	`max_discount_pct_clerk` integer DEFAULT 10 NOT NULL,
	`max_discount_pct_pharmacist` integer DEFAULT 20 NOT NULL,
	`setup_complete` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `supplier` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`gstin` text,
	`drug_licence_no` text,
	`address` text,
	`city` text,
	`state_code` text,
	`credit_days` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`pharmacist_reg_no` text,
	`phone` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);