CREATE TABLE `custom_dataforseo_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`path` text NOT NULL,
	`cost_usd` real NOT NULL,
	`feature` text,
	`project_id` text,
	`job` text
);
--> statement-breakpoint
CREATE INDEX `custom_dataforseo_calls_at_idx` ON `custom_dataforseo_calls` (`at`);--> statement-breakpoint
CREATE TABLE `custom_gsc_daily` (
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`page` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`ctr` real DEFAULT 0 NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `date`, `page`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_gsc_query_daily` (
	`project_id` text NOT NULL,
	`date` text NOT NULL,
	`page` text NOT NULL,
	`query` text NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`project_id`, `date`, `page`, `query`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job` text NOT NULL,
	`period_key` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 1 NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`summary_json` text,
	`error` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_job_runs_job_period_idx` ON `custom_job_runs` (`job`,`period_key`);--> statement-breakpoint
CREATE TABLE `custom_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`title` text NOT NULL,
	`hypothesis` text NOT NULL,
	`reason` text NOT NULL,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`target_url` text,
	`target_query` text,
	`before` text,
	`after` text,
	`draft` text,
	`snippet` text,
	`why_safe` text,
	`risk_tier` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`score_inputs_json` text DEFAULT '{}' NOT NULL,
	`value_bucket` text,
	`status` text DEFAULT 'open' NOT NULL,
	`applied_at` text,
	`verify_url` text,
	`verified_at` text,
	`verify_result_json` text,
	`review_at` text,
	`verdict_json` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_moves_project_dedupe_idx` ON `custom_moves` (`project_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `custom_moves_project_status_idx` ON `custom_moves` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `custom_moves_review_at_idx` ON `custom_moves` (`review_at`);--> statement-breakpoint
CREATE TABLE `custom_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text,
	`move_id` text,
	`read_at` text,
	`email_sent_at` text,
	`push_sent_at` text,
	`imessage_sent_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_notifications_org_created_idx` ON `custom_notifications` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `custom_org_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`notify_email` integer DEFAULT true NOT NULL,
	`notify_push` integer DEFAULT true NOT NULL,
	`notify_imessage` integer DEFAULT false NOT NULL,
	`imessage_to` text,
	`weekly_plan_day` integer DEFAULT 1 NOT NULL,
	`weekly_plan_hour_utc` integer DEFAULT 11 NOT NULL,
	`monthly_budget_usd` real DEFAULT 25 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_project_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`value_per_lead_usd` real DEFAULT 100 NOT NULL,
	`close_rate` real DEFAULT 0.5 NOT NULL,
	`site_conversion_rate` real,
	`monthly_budget_usd` real DEFAULT 10 NOT NULL,
	`reviews_business_name` text,
	`reviews_location_name` text,
	`indexnow_key` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `custom_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`last_used_at` text,
	`failed_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_push_subscriptions_endpoint_idx` ON `custom_push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `custom_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`external_id` text NOT NULL,
	`author` text,
	`rating` real,
	`text` text,
	`published_at` text,
	`owner_replied` integer DEFAULT false NOT NULL,
	`seen_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_reviews_project_external_idx` ON `custom_reviews` (`project_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `custom_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`taken_at` text NOT NULL,
	`summary_json` text DEFAULT '{}' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_snapshots_project_kind_idx` ON `custom_snapshots` (`project_id`,`kind`,`taken_at`);