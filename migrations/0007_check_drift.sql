-- Idempotent catch-up migration.
-- Migrations 0005 and 0006 added these columns but had no Drizzle snapshots,
-- so drizzle-kit could not track them.  All additions use IF NOT EXISTS so this
-- migration is safe to run on any database regardless of which previous
-- migrations were applied.
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paypal_authorization_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "seller_rating" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verify_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verify_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "buyer_rating" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "buyer_rating_count" integer DEFAULT 0;