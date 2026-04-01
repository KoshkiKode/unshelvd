import { pgTable, text, integer, serial, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  createdAt: timestamp("created_at").defaultNow(),
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
  username: z.string().min(3).max(30),
  displayName: z.string().min(1).max(50),
  email: z.string().email(),
  password: z.string().min(6),
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
});

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
