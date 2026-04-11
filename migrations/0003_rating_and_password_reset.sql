ALTER TABLE "users" ADD COLUMN "rating_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_reset_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "buyer_rating" integer;
