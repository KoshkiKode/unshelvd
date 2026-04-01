import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  createdAt: text("created_at").default("NOW"),
});

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  createdAt: text("created_at").default("NOW"),
});

export const bookRequests = sqliteTable("book_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  isbn: text("isbn"),
  edition: text("edition"),
  description: text("description"),
  maxPrice: real("max_price"),
  status: text("status").default("open"),
  createdAt: text("created_at").default("NOW"),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  bookId: integer("book_id"),
  content: text("content").notNull(),
  isRead: integer("is_read").default(0),
  createdAt: text("created_at").default("NOW"),
});

export const offers = sqliteTable("offers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  bookId: integer("book_id").notNull(),
  amount: real("amount").notNull(),
  status: text("status").default("pending"),
  counterAmount: real("counter_amount"),
  message: text("message"),
  createdAt: text("created_at").default("NOW"),
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
