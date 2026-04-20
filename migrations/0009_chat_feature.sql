-- Peer-to-peer negotiation chat feature
-- Adds: conversations, block_records, reports, audit_log tables
-- Modifies: messages (conversation_id, deleted_by_sender, flagged), books (chat_enabled)

-- ── books: seller opt-out per listing ──────────────────────────────────────
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "chat_enabled" boolean NOT NULL DEFAULT true;

-- ── conversations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "conversations" (
  "id"           serial PRIMARY KEY,
  "book_id"      integer NOT NULL REFERENCES "books"("id") ON DELETE RESTRICT,
  "buyer_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "seller_id"    integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status"       text    NOT NULL DEFAULT 'active',
  "initiated_at" timestamp DEFAULT now(),
  "closed_at"    timestamp
);

CREATE INDEX IF NOT EXISTS "conversations_buyer_id_idx"  ON "conversations"("buyer_id");
CREATE INDEX IF NOT EXISTS "conversations_seller_id_idx" ON "conversations"("seller_id");
CREATE INDEX IF NOT EXISTS "conversations_book_id_idx"   ON "conversations"("book_id");
CREATE INDEX IF NOT EXISTS "conversations_status_idx"    ON "conversations"("status");

-- unique: one conversation per (listing, buyer)
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_book_buyer_uniq"
  ON "conversations"("book_id", "buyer_id");

-- ── messages: new fields ────────────────────────────────────────────────────
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "conversation_id"    integer REFERENCES "conversations"("id") ON DELETE SET NULL;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted_by_sender"  boolean NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "flagged"            boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages"("conversation_id");

-- ── block_records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "block_records" (
  "id"         serial PRIMARY KEY,
  "blocker_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "blocked_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reason"     text,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "block_records_blocker_id_idx" ON "block_records"("blocker_id");
CREATE INDEX IF NOT EXISTS "block_records_blocked_id_idx" ON "block_records"("blocked_id");
CREATE UNIQUE INDEX IF NOT EXISTS "block_records_pair_uniq" ON "block_records"("blocker_id", "blocked_id");

-- ── reports ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reports" (
  "id"                  serial PRIMARY KEY,
  "reporter_id"         integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reported_user_id"    integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "message_id"          integer REFERENCES "messages"("id") ON DELETE SET NULL,
  "conversation_id"     integer REFERENCES "conversations"("id") ON DELETE SET NULL,
  "category"            text NOT NULL,
  "description"         text,
  "created_at"          timestamp DEFAULT now(),
  "reviewed_by_admin"   integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at"         timestamp,
  "outcome"             text
);

CREATE INDEX IF NOT EXISTS "reports_reporter_id_idx"      ON "reports"("reporter_id");
CREATE INDEX IF NOT EXISTS "reports_reported_user_id_idx" ON "reports"("reported_user_id");
CREATE INDEX IF NOT EXISTS "reports_outcome_idx"          ON "reports"("outcome");

-- ── audit_log (append-only) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id"             serial PRIMARY KEY,
  "action"         text NOT NULL,
  "admin_id"       integer REFERENCES "users"("id") ON DELETE SET NULL,
  "target_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "details"        text,
  "created_at"     timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "audit_log_action_idx"         ON "audit_log"("action");
CREATE INDEX IF NOT EXISTS "audit_log_admin_id_idx"       ON "audit_log"("admin_id");
CREATE INDEX IF NOT EXISTS "audit_log_target_user_id_idx" ON "audit_log"("target_user_id");
