CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"admin_id" integer,
	"target_user_id" integer,
	"details" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "block_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"blocker_id" integer NOT NULL,
	"blocked_id" integer NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"initiated_at" timestamp DEFAULT now(),
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_id" integer NOT NULL,
	"reported_user_id" integer NOT NULL,
	"message_id" integer,
	"conversation_id" integer,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"reviewed_by_admin" integer,
	"reviewed_at" timestamp,
	"outcome" text
);
--> statement-breakpoint
ALTER TABLE "book_catalog" ADD COLUMN "unshelvd_id" text;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "chat_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "conversation_id" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "deleted_by_sender" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "flagged" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "unshelvd_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_records" ADD CONSTRAINT "block_records_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_records" ADD CONSTRAINT "block_records_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_log_admin_id_idx" ON "audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_user_id_idx" ON "audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "block_records_blocker_id_idx" ON "block_records" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX "block_records_blocked_id_idx" ON "block_records" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "conversations_buyer_id_idx" ON "conversations" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "conversations_seller_id_idx" ON "conversations" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "conversations_book_id_idx" ON "conversations" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_reporter_id_idx" ON "reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "reports_reported_user_id_idx" ON "reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "reports_outcome_idx" ON "reports" USING btree ("outcome");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
ALTER TABLE "book_catalog" ADD CONSTRAINT "book_catalog_unshelvd_id_unique" UNIQUE("unshelvd_id");--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_unshelvd_id_unique" UNIQUE("unshelvd_id");