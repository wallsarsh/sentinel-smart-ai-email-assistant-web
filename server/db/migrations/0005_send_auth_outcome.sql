ALTER TABLE "send_authorizations" ADD COLUMN "record_id" uuid;--> statement-breakpoint
ALTER TABLE "send_authorizations" ADD COLUMN "ended_reason" text;