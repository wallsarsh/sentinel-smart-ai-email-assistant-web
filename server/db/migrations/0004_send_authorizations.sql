CREATE TABLE "send_authorizations" (
	"nonce_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"state" text DEFAULT 'issued' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "send_authorizations" ADD CONSTRAINT "send_authorizations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_authorizations" ADD CONSTRAINT "send_authorizations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "send_auth_due" ON "send_authorizations" USING btree ("state","release_at");--> statement-breakpoint
CREATE INDEX "send_auth_user" ON "send_authorizations" USING btree ("user_id");