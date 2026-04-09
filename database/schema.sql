-- ============================================================
-- Unshelv'd — Complete Database Schema
-- PostgreSQL (Amazon Aurora compatible)
--
-- Run this once against a fresh database to create all tables.
-- Usage (psql):
--   psql "postgresql://USER:PASSWORD@YOUR-AURORA-ENDPOINT:5432/unshelvd" -f schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS "works" (
    "id"                        serial PRIMARY KEY,
    "title"                     text NOT NULL,
    "title_original"            text,
    "title_original_script"     text,
    "author"                    text NOT NULL,
    "author_original"           text,
    "author_original_script"    text,
    "open_library_work_id"      text UNIQUE,
    "wikidata_id"               text,
    "goodreads_work_id"         text,
    "original_language"         text,
    "first_published_year"      integer,
    "genre"                     text,
    "subjects"                  text,
    "description"               text,
    "cover_url"                 text,
    "edition_count"             integer DEFAULT 0,
    "translation_count"         integer DEFAULT 0,
    "language_count"            integer DEFAULT 0,
    "listing_count"             integer DEFAULT 0,
    "source"                    text,
    "verified"                  boolean DEFAULT false,
    "created_at"                timestamp DEFAULT now(),
    "updated_at"                timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "users" (
    "id"                serial PRIMARY KEY,
    "username"          text NOT NULL UNIQUE,
    "display_name"      text NOT NULL,
    "email"             text NOT NULL UNIQUE,
    "password"          text NOT NULL,
    "bio"               text,
    "avatar_url"        text,
    "location"          text,
    "rating"            real DEFAULT 0,
    "total_sales"       integer DEFAULT 0,
    "total_purchases"   integer DEFAULT 0,
    "role"              text DEFAULT 'user',
    "stripe_account_id" text,
    "stripe_onboarded"  boolean DEFAULT false,
    "created_at"        timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "book_catalog" (
    "id"                    serial PRIMARY KEY,
    "title"                 text NOT NULL,
    "title_native"          text,
    "title_romanized"       text,
    "author"                text NOT NULL,
    "author_native"         text,
    "author_romanized"      text,
    "isbn_10"               text,
    "isbn_13"               text,
    "oclc"                  text,
    "lccn"                  text,
    "open_library_id"       text UNIQUE,
    "goodreads_id"          text,
    "publisher"             text,
    "publisher_native"      text,
    "publication_year"      integer,
    "first_published_year"  integer,
    "edition"               text,
    "edition_number"        integer,
    "pages"                 integer,
    "language"              text NOT NULL,
    "original_language"     text,
    "country_of_origin"     text,
    "script"                text,
    "text_direction"        text,
    "genre"                 text,
    "subjects"              text,
    "dewey_decimal"         text,
    "lc_classification"     text,
    "calendar_system"       text,
    "calendar_year"         text,
    "era"                   text,
    "cover_url"             text,
    "description"           text,
    "work_id"               integer REFERENCES "works"("id") ON DELETE SET NULL,
    "source"                text,
    "source_id"             text,
    "verified"              boolean DEFAULT false,
    "created_at"            timestamp DEFAULT now(),
    "updated_at"            timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "books" (
    "id"                serial PRIMARY KEY,
    "user_id"           integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "title"             text NOT NULL,
    "author"            text NOT NULL,
    "isbn"              text,
    "cover_url"         text,
    "description"       text,
    "condition"         text NOT NULL,
    "status"            text NOT NULL,
    "price"             real,
    "genre"             text,
    "publisher"         text,
    "edition"           text,
    "year"              integer,
    "language"          text,
    "original_language" text,
    "country_of_origin" text,
    "print_country"     text,
    "era"               text,
    "script"            text,
    "calendar_system"   text,
    "calendar_year"     text,
    "text_direction"    text,
    "catalog_id"        integer REFERENCES "book_catalog"("id") ON DELETE SET NULL,
    "work_id"           integer REFERENCES "works"("id") ON DELETE SET NULL,
    "created_at"        timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "book_requests" (
    "id"                serial PRIMARY KEY,
    "user_id"           integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "title"             text NOT NULL,
    "author"            text,
    "isbn"              text,
    "edition"           text,
    "description"       text,
    "max_price"         real,
    "language"          text,
    "country_of_origin" text,
    "status"            text DEFAULT 'open',
    "created_at"        timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "messages" (
    "id"            serial PRIMARY KEY,
    "sender_id"     integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "receiver_id"   integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "book_id"       integer REFERENCES "books"("id") ON DELETE SET NULL,
    "content"       text NOT NULL,
    "is_read"       boolean DEFAULT false,
    "created_at"    timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "offers" (
    "id"                serial PRIMARY KEY,
    "buyer_id"          integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "seller_id"         integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "book_id"           integer NOT NULL REFERENCES "books"("id") ON DELETE RESTRICT,
    "amount"            real NOT NULL,
    "status"            text DEFAULT 'pending',
    "counter_amount"    real,
    "message"           text,
    "created_at"        timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "transactions" (
    "id"                        serial PRIMARY KEY,
    "buyer_id"                  integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "seller_id"                 integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "book_id"                   integer NOT NULL REFERENCES "books"("id") ON DELETE RESTRICT,
    "offer_id"                  integer REFERENCES "offers"("id") ON DELETE SET NULL,
    "amount"                    real NOT NULL,
    "platform_fee"              real NOT NULL,
    "seller_payout"             real NOT NULL,
    "currency"                  text DEFAULT 'usd',
    "stripe_payment_intent_id"  text,
    "stripe_transfer_id"        text,
    "status"                    text DEFAULT 'pending',
    "shipping_carrier"          text,
    "tracking_number"           text,
    "shipped_at"                timestamp,
    "delivered_at"              timestamp,
    "completed_at"              timestamp,
    "created_at"                timestamp DEFAULT now(),
    "updated_at"                timestamp DEFAULT now()
);

-- ============================================================
-- Indexes for query performance
-- ============================================================

CREATE INDEX IF NOT EXISTS "book_catalog_work_id_idx"      ON "book_catalog"   ("work_id");
CREATE INDEX IF NOT EXISTS "book_requests_user_id_idx"     ON "book_requests"  ("user_id");
CREATE INDEX IF NOT EXISTS "book_requests_status_idx"      ON "book_requests"  ("status");
CREATE INDEX IF NOT EXISTS "books_user_id_idx"             ON "books"          ("user_id");
CREATE INDEX IF NOT EXISTS "books_status_idx"              ON "books"          ("status");
CREATE INDEX IF NOT EXISTS "books_genre_idx"               ON "books"          ("genre");
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx"        ON "messages"       ("sender_id");
CREATE INDEX IF NOT EXISTS "messages_receiver_id_idx"      ON "messages"       ("receiver_id");
CREATE INDEX IF NOT EXISTS "messages_is_read_idx"          ON "messages"       ("is_read");
CREATE INDEX IF NOT EXISTS "offers_buyer_id_idx"           ON "offers"         ("buyer_id");
CREATE INDEX IF NOT EXISTS "offers_seller_id_idx"          ON "offers"         ("seller_id");
CREATE INDEX IF NOT EXISTS "transactions_buyer_id_idx"     ON "transactions"   ("buyer_id");
CREATE INDEX IF NOT EXISTS "transactions_seller_id_idx"    ON "transactions"   ("seller_id");
CREATE INDEX IF NOT EXISTS "transactions_status_idx"       ON "transactions"   ("status");

