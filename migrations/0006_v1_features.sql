-- Email verification for new user registrations
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verify_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verify_expiry" timestamp;

-- All existing users are considered verified (pre-dates verification requirement)
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;

-- Seller-rates-buyer: reciprocal trust signal on transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "seller_rating" integer;

-- PayPal escrow: store authorization ID so funds can be captured on delivery
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "paypal_authorization_id" text;

-- Buyer rating aggregate on the users table (rated by sellers)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "buyer_rating" real DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "buyer_rating_count" integer DEFAULT 0;
