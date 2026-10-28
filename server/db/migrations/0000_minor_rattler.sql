CREATE TYPE "public"."account_status" AS ENUM('active', 'needs_reauth', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('gmail', 'microsoft_graph', 'imap');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('open', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."ai_kind" AS ENUM('anthropic', 'openai', 'openai_compatible');--> statement-breakpoint
CREATE TYPE "public"."ai_task" AS ENUM('triage', 'brief', 'draft', 'repair', 'default');--> statement-breakpoint
CREATE TYPE "public"."brief_section" AS ENUM('top_priorities', 'needs_reply', 'due_today', 'fyi');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('direct_personal', 'work_request', 'meeting_calendar', 'finance_billing', 'notification_automated', 'newsletter_marketing', 'social', 'security_account', 'other');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('local', 'saved', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."folder_role" AS ENUM('inbox', 'sent', 'drafts', 'trash', 'spam', 'archive', 'other');--> statement-breakpoint
CREATE TYPE "public"."importance" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('p1_do_now', 'p2_today', 'p3_this_week', 'p4_fyi');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('pending', 'submitting', 'sent', 'failed', 'unknown', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sender_rule_kind" AS ENUM('vip', 'mute', 'correction');--> statement-breakpoint
CREATE TYPE "public"."tls_mode" AS ENUM('implicit_tls', 'start_tls');--> statement-breakpoint
CREATE TYPE "public"."triage_source" AS ENUM('ai', 'rule', 'user');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('urgent', 'not_urgent');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mfa_secrets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_ref" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"step_up_at" timestamp with time zone,
	"user_agent" text DEFAULT '' NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "account_type" NOT NULL,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"color" integer DEFAULT 4149685 NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"sync_cursor" jsonb,
	"ai_excluded" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_id" text NOT NULL,
	"name" text NOT NULL,
	"role" "folder_role" DEFAULT 'other' NOT NULL,
	"processed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imap_settings" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer NOT NULL,
	"imap_security" "tls_mode" NOT NULL,
	"username" text NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_security" "tls_mode" NOT NULL,
	"smtp_username" text,
	"drafts_folder" text,
	"sent_folder" text,
	"server_saves_sent" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"folder_id" uuid NOT NULL,
	"thread_id" uuid,
	"provider_message_id" text NOT NULL,
	"internet_message_id" text DEFAULT '' NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"to_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cc_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html_sanitized" text,
	"attachment_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"references_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"list_unsubscribe" text
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_thread_id" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"last_message_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"item_text" text NOT NULL,
	"due_at" timestamp with time zone,
	"due_text" text,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brief_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"section" "brief_section" NOT NULL,
	"item_text" text NOT NULL,
	"message_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"headline" text NOT NULL,
	"stats_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_id" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_draft_id" text,
	"idempotency_key" text NOT NULL,
	"tone" text NOT NULL,
	"intent" text NOT NULL,
	"status" "draft_status" DEFAULT 'local' NOT NULL,
	"body_preview" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"draft_ref_id" uuid,
	"internet_message_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"recipient_count" integer NOT NULL,
	"status" "send_status" DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "sender_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"pattern" text NOT NULL,
	"rule" "sender_rule_kind" NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_results" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "category" NOT NULL,
	"importance" "importance" NOT NULL,
	"urgency" "urgency" NOT NULL,
	"priority" "priority" NOT NULL,
	"needs_reply" boolean NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL,
	"confidence" double precision,
	"source" "triage_source" NOT NULL,
	"provider_id" text,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "ai_kind" NOT NULL,
	"display_name" text NOT NULL,
	"base_url" text NOT NULL,
	"preset_id" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"consent_given_at" timestamp with time zone,
	"models_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"options_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_routes" (
	"user_id" uuid NOT NULL,
	"task" "ai_task" NOT NULL,
	"position" integer NOT NULL,
	"provider_id" uuid NOT NULL,
	"model" text NOT NULL,
	"params_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bg_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"trigger" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"outcome" text,
	"new_messages" integer DEFAULT 0 NOT NULL,
	"triaged" integer DEFAULT 0 NOT NULL,
	"error_code" text
);
--> statement-breakpoint
CREATE TABLE "data_keys" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"wrapped_key" text NOT NULL,
	"kek_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notified" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_id" uuid,
	"model" text NOT NULL,
	"task" "ai_task" NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_settings" ADD CONSTRAINT "imap_settings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imap_settings" ADD CONSTRAINT "imap_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_items" ADD CONSTRAINT "brief_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brief_items" ADD CONSTRAINT "brief_items_brief_id_daily_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."daily_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_briefs" ADD CONSTRAINT "daily_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_refs" ADD CONSTRAINT "draft_refs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_refs" ADD CONSTRAINT "draft_refs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_records" ADD CONSTRAINT "send_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_records" ADD CONSTRAINT "send_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_results" ADD CONSTRAINT "triage_results_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_results" ADD CONSTRAINT "triage_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_routes" ADD CONSTRAINT "ai_task_routes_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bg_runs" ADD CONSTRAINT "bg_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_keys" ADD CONSTRAINT "data_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notified" ADD CONSTRAINT "notified_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_user_at" ON "audit_log" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "recovery_user" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_email" ON "accounts" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_account_provider" ON "folders" USING btree ("account_id","provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_account_provider" ON "messages" USING btree ("account_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "messages_user_received" ON "messages" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "messages_thread" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "threads_account_provider" ON "threads" USING btree ("account_id","provider_thread_id");--> statement-breakpoint
CREATE INDEX "actions_user_status_due" ON "action_items" USING btree ("user_id","status","due_at");--> statement-breakpoint
CREATE INDEX "briefs_user_created" ON "daily_briefs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_refs_key" ON "draft_refs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "send_records_user_approved" ON "send_records" USING btree ("user_id","approved_at");--> statement-breakpoint
CREATE INDEX "sender_rules_user" ON "sender_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "triage_user_priority" ON "triage_results" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "ai_providers_user" ON "ai_providers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_routes_pk" ON "ai_task_routes" USING btree ("user_id","task","position");--> statement-breakpoint
CREATE INDEX "bg_runs_user_started" ON "bg_runs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notified_pk" ON "notified" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_user_name" ON "secrets" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_pk" ON "settings" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "usage_user_created" ON "usage_records" USING btree ("user_id","created_at");