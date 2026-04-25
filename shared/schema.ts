import { pgTable, text, integer, serial, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// WORKS — the abstract literary creation
// One "work" = one creative work by an author.
// All editions, translations, printings, and adaptations link here.
// e.g. "War and Peace" by Leo Tolstoy is ONE work, with 500+ editions.
// ═══════════════════════════════════════════════════════════════

export const works = pgTable("works", {
  id: serial("id").primaryKey(),
  // Unshelv'd catalog ID — stable human-readable identifier for the work,
  // e.g. "UN00000042W". Editions of this work all carry IDs of the form
  // "UN00000042W-E001", "UN00000042W-E002", ... so the relationship is
  // visible without a join. Assigned deterministically by the seed
  // generator (scripts/build-seed-from-goodbooks.py).
  unshelvdId: text("unshelvd_id").unique(),
  // Canonical identity
  title: text("title").notNull(),               // canonical English title
  titleOriginal: text("title_original"),         // title in original language
  titleOriginalScript: text("title_original_script"), // in native script (e.g. Война и мир)
  author: text("author").notNull(),              // canonical author name
  authorOriginal: text("author_original"),       // author in original language
  authorOriginalScript: text("author_original_script"),
  // Identifiers
  openLibraryWorkId: text("open_library_work_id").unique(), // e.g. "/works/OL1168083W"
  wikidataId: text("wikidata_id"),               // e.g. "Q161531"
  goodreadsWorkId: text("goodreads_work_id"),
  // Metadata
  originalLanguage: text("original_language"),
  firstPublishedYear: integer("first_published_year"),
  genre: text("genre"),                          // comma-separated
  subjects: text("subjects"),                    // comma-separated
  description: text("description"),
  coverUrl: text("cover_url"),                   // best available cover
  // Stats (denormalized for performance)
  editionCount: integer("edition_count").default(0),
  translationCount: integer("translation_count").default(0),
  languageCount: integer("language_count").default(0),
  listingCount: integer("listing_count").default(0), // active user listings
  // Provenance
  source: text("source"),                        // "open_library", "manual"
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  location: text("location"),
  rating: real("rating").default(0),
  ratingCount: integer("rating_count").default(0),
  totalSales: integer("total_sales").default(0),
  totalPurchases: integer("total_purchases").default(0),
  role: text("role").default("user"),  // "user" | "admin" | "suspended" | "deleted"
  stripeAccountId: text("stripe_account_id"),  // Stripe Connect Express account ID
  stripeOnboarded: boolean("stripe_onboarded").default(false), // completed Stripe onboarding
  // Password reset (token-based, no email service required)
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
  // Email verification
  emailVerified: boolean("email_verified").default(false),
  emailVerifyToken: text("email_verify_token"),
  emailVerifyExpiry: timestamp("email_verify_expiry"),
  // Buyer reputation (rated by sellers)
  buyerRating: real("buyer_rating").default(0),
  buyerRatingCount: integer("buyer_rating_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  author: text("author").notNull(),
  isbn: text("isbn"),
  coverUrl: text("cover_url"),
  description: text("description"),
  condition: text("condition").notNull(),
  status: text("status").notNull(),
  price: real("price"),
  genre: text("genre"),
  publisher: text("publisher"),
  edition: text("edition"),
  year: integer("year"),
  // International & historical book support
  language: text("language"),          // e.g. "Serbian", "Russian", "Japanese", "English"
  originalLanguage: text("original_language"), // if this is a translation
  countryOfOrigin: text("country_of_origin"), // includes historical: "Yugoslavia", "USSR", "Ottoman Empire"
  printCountry: text("print_country"),  // where this specific copy was printed
  era: text("era"),                    // "Antique (Pre-1900)", "Vintage (1900-1970)", "Modern", etc.
  script: text("script"),              // "Latin", "Cyrillic", "Arabic", "Kanji", etc.
  calendarSystem: text("calendar_system"), // "gregorian", "islamic_hijri", "hebrew", etc.
  calendarYear: text("calendar_year"),    // year in the specified calendar, e.g. "1444 AH"
  textDirection: text("text_direction"),  // "ltr" or "rtl"
  catalogId: integer("catalog_id").references(() => bookCatalog.id, { onDelete: "set null" }), // link to canonical book_catalog entry
  workId: integer("work_id").references(() => works.id, { onDelete: "set null" }),             // link to the abstract work
  // seller opt-out: set false to disable chat for this specific listing
  chatEnabled: boolean("chat_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("books_user_id_idx").on(table.userId),
  index("books_status_idx").on(table.status),
  index("books_genre_idx").on(table.genre),
]);

// ═══════════════════════════════════════════════════════════════
// CANONICAL BOOK CATALOG — proprietary master database
// Every book ever published, worldwide. User listings link to this.
// ═══════════════════════════════════════════════════════════════

export const bookCatalog = pgTable("book_catalog", {
  id: serial("id").primaryKey(),
  // Unshelv'd catalog edition ID — stable identifier of the form
  // "<workUnshelvdId>-E<NNN>", e.g. "UN00000042W-E003" for the third
  // edition of work UN00000042W. Lets clients reference editions
  // without exposing the integer surrogate keys.
  unshelvdId: text("unshelvd_id").unique(),
  // Core identity
  title: text("title").notNull(),
  titleNative: text("title_native"),        // title in original script (e.g. 戦争と平和)
  titleRomanized: text("title_romanized"),  // romanized version (e.g. Sensō to Heiwa)
  author: text("author").notNull(),
  authorNative: text("author_native"),      // author in original script
  authorRomanized: text("author_romanized"),
  // Identifiers
  isbn10: text("isbn_10"),
  isbn13: text("isbn_13"),
  oclc: text("oclc"),                       // WorldCat number
  lccn: text("lccn"),                       // Library of Congress number
  openLibraryId: text("open_library_id").unique(),   // Open Library work ID — unique for dedup
  goodreadsId: text("goodreads_id"),
  // Publication
  publisher: text("publisher"),
  publisherNative: text("publisher_native"),
  publicationYear: integer("publication_year"),
  firstPublishedYear: integer("first_published_year"),
  edition: text("edition"),
  editionNumber: integer("edition_number"),
  pages: integer("pages"),
  // Language & geography
  language: text("language").notNull(),
  originalLanguage: text("original_language"),
  countryOfOrigin: text("country_of_origin"),
  script: text("script"),
  textDirection: text("text_direction"),   // "ltr" or "rtl"
  // Classification
  genre: text("genre"),                   // comma-separated
  subjects: text("subjects"),             // comma-separated subject headings
  deweyDecimal: text("dewey_decimal"),     // Dewey Decimal Classification
  lcClassification: text("lc_classification"), // Library of Congress Classification
  // Calendar/dating
  calendarSystem: text("calendar_system"),
  calendarYear: text("calendar_year"),
  era: text("era"),
  // Metadata
  coverUrl: text("cover_url"),
  description: text("description"),
  // Work linkage
  workId: integer("work_id").references(() => works.id, { onDelete: "set null" }), // link to the abstract work
  // Data provenance
  source: text("source"),                 // "open_library", "manual", "loc", etc.
  sourceId: text("source_id"),            // ID in the source system
  verified: boolean("verified").default(false), // manually verified entry
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("book_catalog_work_id_idx").on(table.workId),
]);

export const bookRequests = pgTable("book_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  author: text("author"),
  isbn: text("isbn"),
  edition: text("edition"),
  description: text("description"),
  maxPrice: real("max_price"),
  language: text("language"),
  countryOfOrigin: text("country_of_origin"),
  status: text("status").default("open"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("book_requests_user_id_idx").on(table.userId),
  index("book_requests_status_idx").on(table.status),
]);

// ═══════════════════════════════════════════════════════════════
// CONVERSATIONS — one per (listing, buyer) pair
// ═══════════════════════════════════════════════════════════════

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  // active | closed | blocked
  status: text("status").default("active").notNull(),
  initiatedAt: timestamp("initiated_at").defaultNow(),
  closedAt: timestamp("closed_at"),
}, (table) => [
  index("conversations_buyer_id_idx").on(table.buyerId),
  index("conversations_seller_id_idx").on(table.sellerId),
  index("conversations_book_id_idx").on(table.bookId),
  index("conversations_status_idx").on(table.status),
]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  receiverId: integer("receiver_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  bookId: integer("book_id").references(() => books.id, { onDelete: "set null" }),
  // links to the conversation (nullable for legacy messages predating this feature)
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  // soft-delete: sender marks their own message as deleted; server always retains the content
  deletedBySender: boolean("deleted_by_sender").default(false),
  // flagged by auto-scam detection or admin for review
  flagged: boolean("flagged").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("messages_sender_id_idx").on(table.senderId),
  index("messages_receiver_id_idx").on(table.receiverId),
  index("messages_is_read_idx").on(table.isRead),
  index("messages_conversation_id_idx").on(table.conversationId),
]);

// ═══════════════════════════════════════════════════════════════
// BLOCK RECORDS — permanent even after account deletion
// ═══════════════════════════════════════════════════════════════

export const blockRecords = pgTable("block_records", {
  id: serial("id").primaryKey(),
  blockerId: integer("blocker_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  blockedId: integer("blocked_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("block_records_blocker_id_idx").on(table.blockerId),
  index("block_records_blocked_id_idx").on(table.blockedId),
]);

// ═══════════════════════════════════════════════════════════════
// REPORTS — flagging messages/users for admin review
// ═══════════════════════════════════════════════════════════════

export const reports = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reportedUserId: integer("reported_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "set null" }),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  // spam | harassment | scam | other
  category: text("category").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  reviewedByAdmin: integer("reviewed_by_admin").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  // dismissed | warned | temp_banned | banned | escalated
  outcome: text("outcome"),
}, (table) => [
  index("reports_reporter_id_idx").on(table.reporterId),
  index("reports_reported_user_id_idx").on(table.reportedUserId),
  index("reports_outcome_idx").on(table.outcome),
]);

// ═══════════════════════════════════════════════════════════════
// AUDIT LOG — append-only; no row is ever updated or deleted
// ═══════════════════════════════════════════════════════════════

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  adminId: integer("admin_id").references(() => users.id, { onDelete: "set null" }),
  targetUserId: integer("target_user_id").references(() => users.id, { onDelete: "set null" }),
  // JSON-stringified context (conversationId, messageId, reportId, etc.)
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("audit_log_action_idx").on(table.action),
  index("audit_log_admin_id_idx").on(table.adminId),
  index("audit_log_target_user_id_idx").on(table.targetUserId),
]);

export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  amount: real("amount").notNull(),
  status: text("status").default("pending"),
  counterAmount: real("counter_amount"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("offers_buyer_id_idx").on(table.buyerId),
  index("offers_seller_id_idx").on(table.sellerId),
]);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  displayName: true,
  email: true,
  password: true,
}).extend({
  // Username: 3-30 chars, Unicode-safe, no whitespace at edges
  username: z.string().min(3, "Username must be at least 3 characters").max(30).trim()
    .regex(/^[\p{L}\p{N}_.-]+$/u, "Username can only contain letters, numbers, underscores, dots, and hyphens"),
  displayName: z.string().min(1, "Display name is required").max(100).trim(),
  email: z.string().email("Invalid email address"),
  // Password: 12+ chars — full validation done server-side with context
  password: z.string().min(12, "Password must be at least 12 characters"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const insertBookSchema = createInsertSchema(books).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  title: z.string().min(1).max(500),
  author: z.string().min(1).max(200),
  condition: z.enum(["new", "like-new", "good", "fair", "poor"]),
  status: z.enum(["for-sale", "not-for-sale", "open-to-offers", "wishlist", "reading"]),
  price: z.number().min(0).nullable().optional(),
  genre: z.string().max(200).nullable().optional(),
  isbn: z.string().max(20).nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  publisher: z.string().max(200).nullable().optional(),
  edition: z.string().max(100).nullable().optional(),
  year: z.number().int().min(1).max(9999).nullable().optional(),
  language: z.string().max(100).nullable().optional(),
  originalLanguage: z.string().max(100).nullable().optional(),
  countryOfOrigin: z.string().max(100).nullable().optional(),
  printCountry: z.string().max(100).nullable().optional(),
  era: z.string().max(100).nullable().optional(),
  script: z.string().max(50).nullable().optional(),
  calendarSystem: z.string().max(50).nullable().optional(),
  calendarYear: z.string().max(20).nullable().optional(),
  textDirection: z.string().max(20).nullable().optional(),
  catalogId: z.number().nullable().optional(),
  workId: z.number().nullable().optional(),
});

export const insertCatalogSchema = createInsertSchema(bookCatalog).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1),
  author: z.string().min(1),
  language: z.string().min(1),
});

export type CatalogEntry = typeof bookCatalog.$inferSelect;
export type InsertCatalogEntry = z.infer<typeof insertCatalogSchema>;
export type Work = typeof works.$inferSelect;

// ═══════════════════════════════════════════════════════════════
// TRANSACTIONS — payment/escrow for book purchases
// Flow: buyer pays → funds held → seller ships → buyer confirms → funds released
// ═══════════════════════════════════════════════════════════════

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  // Parties
  buyerId: integer("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  sellerId: integer("seller_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  bookId: integer("book_id").notNull().references(() => books.id, { onDelete: "restrict" }),
  offerId: integer("offer_id").references(() => offers.id, { onDelete: "set null" }), // if from an accepted offer
  // Money
  amount: real("amount").notNull(),           // what the buyer pays
  platformFee: real("platform_fee").notNull(), // Unshelv'd cut
  sellerPayout: real("seller_payout").notNull(), // what seller receives
  currency: text("currency").default("usd"),
  // Stripe
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeTransferId: text("stripe_transfer_id"),  // payout to seller
  // PayPal
  paypalOrderId: text("paypal_order_id"),          // PayPal order ID (created before capture)
  paypalCaptureId: text("paypal_capture_id"),      // PayPal capture ID (set after successful capture)
  paypalAuthorizationId: text("paypal_authorization_id"), // PayPal auth ID (authorize-then-capture escrow)
  // Status flow: pending → paid → shipped → delivered → completed | disputed | refunded
  status: text("status").default("pending"),
  // Buyer rating (1-5) given after transaction is completed
  buyerRating: integer("buyer_rating"),
  // Seller rating of buyer (1-5) given after transaction is completed
  sellerRating: integer("seller_rating"),
  // Tracking
  shippingCarrier: text("shipping_carrier"),
  trackingNumber: text("tracking_number"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  completedAt: timestamp("completed_at"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("transactions_buyer_id_idx").on(table.buyerId),
  index("transactions_seller_id_idx").on(table.sellerId),
  index("transactions_status_idx").on(table.status),
]);

export type Transaction = typeof transactions.$inferSelect;

export const insertBookRequestSchema = createInsertSchema(bookRequests).omit({
  id: true,
  userId: true,
  createdAt: true,
  status: true,
}).extend({
  title: z.string().min(1).max(500),
  author: z.string().max(200).nullable().optional(),
  isbn: z.string().max(20).nullable().optional(),
  edition: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  maxPrice: z.number().min(0).nullable().optional(),
  language: z.string().max(100).nullable().optional(),
  countryOfOrigin: z.string().max(100).nullable().optional(),
});

export const insertMessageSchema = z.object({
  receiverId: z.number(),
  bookId: z.number().nullable().optional(),
  content: z.string().min(1).max(5000),
});

export const insertOfferSchema = z.object({
  bookId: z.number(),
  amount: z.number().min(0.01),
  message: z.string().max(1000).nullable().optional(),
});

export const updateOfferSchema = z.object({
  status: z.enum(["accepted", "declined", "countered"]),
  counterAmount: z.number().min(0.01).nullable().optional(),
});

// ═══════════════════════════════════════════════════════════════
// PLATFORM SETTINGS — admin-managed key/value configuration store
// Keys: stripe_enabled, stripe_secret_key, stripe_publishable_key,
//       stripe_webhook_secret, paypal_enabled, paypal_client_id,
//       paypal_client_secret, platform_fee_percent,
//       maintenance_mode, registrations_enabled, etc.
// ═══════════════════════════════════════════════════════════════
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PlatformSetting = typeof platformSettings.$inferSelect;

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Book = typeof books.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;
export type BookRequest = typeof bookRequests.$inferSelect;
export type InsertBookRequest = z.infer<typeof insertBookRequestSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type BlockRecord = typeof blockRecords.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;

export const insertConversationSchema = z.object({
  bookId: z.number().int().positive(),
});

export const insertBlockSchema = z.object({
  blockedId: z.number().int().positive(),
  reason: z.string().max(500).nullable().optional(),
});

export const insertReportSchema = z.object({
  reportedUserId: z.number().int().positive(),
  messageId: z.number().int().positive().nullable().optional(),
  conversationId: z.number().int().positive().nullable().optional(),
  category: z.enum(["spam", "harassment", "scam", "other"]),
  description: z.string().max(2000).nullable().optional(),
});

/** Transaction statuses that represent a terminal (finished) state — no further action needed. */
export const TERMINAL_TX_STATUSES: string[] = ["completed", "refunded", "failed", "cancelled"];
