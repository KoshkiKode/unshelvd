ALTER TABLE "transactions" ADD COLUMN "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "paypal_authorization_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "seller_rating" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verify_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verify_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buyer_rating" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "buyer_rating_count" integer DEFAULT 0;