import { pgTable, text, integer, serial, real, boolean, timestamp } from "drizzle-orm/pg-core";
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
  totalSales: integer("total_sales").default(0),
  totalPurchases: integer("total_purchases").default(0),
  role: text("role").default("user"),  // "user" | "admin" | "suspended"
  stripeAccountId: text("stripe_account_id"),  // Stripe Connect Express account ID
  stripeOnboarded: boolean("stripe_onboarded").default(false), // completed Stripe onboarding
  createdAt: timestamp("created_at").defaultNow(),
});

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
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
  catalogId: integer("catalog_id"),       // link to canonical book_catalog entry
  workId: integer("work_id"),              // link to the abstract work
  createdAt: timestamp("created_at").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// CANONICAL BOOK CATALOG — proprietary master database
// Every book ever published, worldwide. User listings link to this.
// ═══════════════════════════════════════════════════════════════

export const bookCatalog = pgTable("book_catalog", {
  id: serial("id").primaryKey(),
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
  openLibraryId: text("open_library_id"),   // Open Library work ID
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
  workId: integer("work_id"),             // link to the abstract work
  // Data provenance
  source: text("source"),                 // "open_library", "manual", "loc", etc.
  sourceId: text("source_id"),            // ID in the source system
  verified: boolean("verified").default(false), // manually verified entry
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bookRequests = pgTable("book_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
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
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  bookId: integer("book_id"),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  bookId: integer("book_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").default("pending"),
  counterAmount: real("counter_amount"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
});

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
  title: z.string().min(1),
  author: z.string().min(1),
  condition: z.enum(["new", "like-new", "good", "fair", "poor"]),
  status: z.enum(["for-sale", "not-for-sale", "open-to-offers", "wishlist", "reading"]),
  price: z.number().min(0).nullable().optional(),
  genre: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  coverUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  language: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  countryOfOrigin: z.string().nullable().optional(),
  printCountry: z.string().nullable().optional(),
  era: z.string().nullable().optional(),
  script: z.string().nullable().optional(),
  calendarSystem: z.string().nullable().optional(),
  calendarYear: z.string().nullable().optional(),
  textDirection: z.string().nullable().optional(),
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
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  bookId: integer("book_id").notNull(),
  offerId: integer("offer_id"),              // if from an accepted offer
  // Money
  amount: real("amount").notNull(),           // what the buyer pays
  platformFee: real("platform_fee").notNull(), // Unshelv'd cut
  sellerPayout: real("seller_payout").notNull(), // what seller receives
  currency: text("currency").default("usd"),
  // Stripe
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeTransferId: text("stripe_transfer_id"),  // payout to seller
  // Status flow: pending → paid → shipped → delivered → completed | disputed | refunded
  status: text("status").default("pending"),
  // Tracking
  shippingCarrier: text("shipping_carrier"),
  trackingNumber: text("tracking_number"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  completedAt: timestamp("completed_at"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Transaction = typeof transactions.$inferSelect;

export const insertBookRequestSchema = createInsertSchema(bookRequests).omit({
  id: true,
  userId: true,
  createdAt: true,
  status: true,
}).extend({
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  isbn: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  maxPrice: z.number().min(0).nullable().optional(),
  language: z.string().nullable().optional(),
  countryOfOrigin: z.string().nullable().optional(),
});

export const insertMessageSchema = z.object({
  receiverId: z.number(),
  bookId: z.number().nullable().optional(),
  content: z.string().min(1),
});

export const insertOfferSchema = z.object({
  bookId: z.number(),
  amount: z.number().min(0.01),
  message: z.string().nullable().optional(),
});

export const updateOfferSchema = z.object({
  status: z.enum(["accepted", "declined", "countered"]),
  counterAmount: z.number().min(0.01).nullable().optional(),
});

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
