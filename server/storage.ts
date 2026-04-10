import {
  type User, type InsertUser, type Book, type InsertBook,
  type BookRequest, type InsertBookRequest, type Message, type InsertMessage,
  type Offer, type InsertOffer,
  users, books, bookRequests, messages, offers,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, or, like, desc, asc, gte, lte, sql, ilike } from "drizzle-orm";
import { sanitizeLikeInput } from "./security";

// Unix socket connections (Cloud SQL) don't use SSL
const isUnixSocket = (process.env.DATABASE_URL || "").includes("host=/");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isUnixSocket ? false : (process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false),
  connectionTimeoutMillis: 10_000,
});

// Prevent unhandled pool errors from crashing the process
// (pg docs: "It is important to attach an error listener to your pool")
pool.on("error", (err) => {
  console.error("Unexpected pool error on idle client:", err.message);
});

export const db = drizzle(pool);

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;

  // Books
  getBook(id: number): Promise<Book | undefined>;
  getBooks(filters: BookFilters): Promise<Book[]>;
  getBooksByUser(userId: number, limit?: number, offset?: number): Promise<Book[]>;
  createBook(userId: number, book: InsertBook): Promise<Book>;
  updateBook(id: number, userId: number, book: Partial<InsertBook>): Promise<Book | undefined>;
  deleteBook(id: number, userId: number): Promise<boolean>;

  // Book Requests
  getBookRequests(filters?: { status?: string }): Promise<BookRequest[]>;
  getBookRequest(id: number): Promise<BookRequest | undefined>;
  createBookRequest(userId: number, request: InsertBookRequest): Promise<BookRequest>;
  updateBookRequest(id: number, userId: number, data: Partial<BookRequest>): Promise<BookRequest | undefined>;

  // Messages
  getConversations(userId: number): Promise<any[]>;
  getMessages(userId: number, otherUserId: number): Promise<Message[]>;
  createMessage(senderId: number, message: InsertMessage): Promise<Message>;
  markMessagesRead(userId: number, senderId: number): Promise<void>;
  getUnreadCount(userId: number): Promise<number>;

  // Offers
  getOffers(userId: number): Promise<{ sent: any[]; received: any[] }>;
  getOffer(id: number): Promise<Offer | undefined>;
  createOffer(buyerId: number, sellerId: number, offer: InsertOffer): Promise<Offer>;
  updateOffer(id: number, userId: number, status: string, counterAmount?: number | null): Promise<Offer | undefined>;
}

export interface BookFilters {
  search?: string;
  genre?: string;
  condition?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  language?: string;
  countryOfOrigin?: string;
  era?: string;
  script?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.username, username));
    return rows[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const rows = await db.select().from(users).where(eq(users.email, email));
    return rows[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const rows = await db.insert(users).values(insertUser).returning();
    return rows[0];
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const rows = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return rows[0];
  }

  // Books
  async getBook(id: number): Promise<Book | undefined> {
    const rows = await db.select().from(books).where(eq(books.id, id));
    return rows[0];
  }

  async getBooks(filters: BookFilters): Promise<Book[]> {
    const conditions = [];

    // Only show purchasable books by default in browse (for-sale, open-to-offers)
    if (filters.status) {
      conditions.push(eq(books.status, filters.status));
    } else {
      conditions.push(or(eq(books.status, "for-sale"), eq(books.status, "open-to-offers")));
    }

    if (filters.search) {
      const term = `%${sanitizeLikeInput(filters.search)}%`;
      conditions.push(or(ilike(books.title, term), ilike(books.author, term)));
    }

    if (filters.genre) {
      const g = sanitizeLikeInput(filters.genre);
      // Match exact genre in comma-separated list without false positives
      // (e.g. "Fiction" should NOT match "Non-Fiction")
      conditions.push(
        or(
          ilike(books.genre, g),             // exact match
          ilike(books.genre, `${g},%`),      // starts with "Genre,..."
          ilike(books.genre, `%,${g}`),      // ends with "...,Genre"
          ilike(books.genre, `%,${g},%`),    // middle: "...,Genre,..."
        ),
      );
    }

    if (filters.condition) {
      conditions.push(eq(books.condition, filters.condition));
    }

    if (filters.minPrice !== undefined) {
      conditions.push(gte(books.price, filters.minPrice));
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(lte(books.price, filters.maxPrice));
    }

    if (filters.language) {
      conditions.push(ilike(books.language, `%${sanitizeLikeInput(filters.language)}%`));
    }

    if (filters.countryOfOrigin) {
      conditions.push(ilike(books.countryOfOrigin, `%${sanitizeLikeInput(filters.countryOfOrigin)}%`));
    }

    if (filters.era) {
      conditions.push(eq(books.era, filters.era));
    }

    if (filters.script) {
      conditions.push(ilike(books.script, `%${sanitizeLikeInput(filters.script)}%`));
    }

    let query = db.select().from(books);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Sort
    if (filters.sort === "price-asc") {
      query = query.orderBy(asc(books.price)) as any;
    } else if (filters.sort === "price-desc") {
      query = query.orderBy(desc(books.price)) as any;
    } else {
      query = query.orderBy(desc(books.id)) as any;
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    query = query.limit(limit).offset(offset) as any;

    return await query;
  }

  async getBooksByUser(userId: number, limit = 200, offset = 0): Promise<Book[]> {
    return await db
      .select()
      .from(books)
      .where(eq(books.userId, userId))
      .orderBy(desc(books.id))
      .limit(limit)
      .offset(offset);
  }

  async createBook(userId: number, book: InsertBook): Promise<Book> {
    const rows = await db.insert(books).values({ ...book, userId }).returning();
    return rows[0];
  }

  async updateBook(id: number, userId: number, book: Partial<InsertBook>): Promise<Book | undefined> {
    const rows = await db.update(books).set(book).where(and(eq(books.id, id), eq(books.userId, userId))).returning();
    return rows[0];
  }

  async deleteBook(id: number, userId: number): Promise<boolean> {
    const result = await db.delete(books).where(and(eq(books.id, id), eq(books.userId, userId))).returning();
    return result.length > 0;
  }

  // Book Requests
  async getBookRequests(filters?: { status?: string }): Promise<BookRequest[]> {
    if (filters?.status) {
      return await db.select().from(bookRequests).where(eq(bookRequests.status, filters.status)).orderBy(desc(bookRequests.id));
    }
    return await db.select().from(bookRequests).orderBy(desc(bookRequests.id));
  }

  async getBookRequest(id: number): Promise<BookRequest | undefined> {
    const rows = await db.select().from(bookRequests).where(eq(bookRequests.id, id));
    return rows[0];
  }

  async createBookRequest(userId: number, request: InsertBookRequest): Promise<BookRequest> {
    const rows = await db.insert(bookRequests).values({ ...request, userId }).returning();
    return rows[0];
  }

  async updateBookRequest(id: number, userId: number, data: Partial<BookRequest>): Promise<BookRequest | undefined> {
    const rows = await db.update(bookRequests).set(data).where(and(eq(bookRequests.id, id), eq(bookRequests.userId, userId))).returning();
    return rows[0];
  }

  // Messages
  async getConversations(userId: number): Promise<any[]> {
    const allMessages = await db.select().from(messages)
      .where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))
      .orderBy(desc(messages.id));

    const convMap = new Map<number, { otherUserId: number; lastMessage: Message; unreadCount: number }>();

    for (const msg of allMessages) {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!convMap.has(otherUserId)) {
        const unreadCount = allMessages.filter(m => m.senderId === otherUserId && m.receiverId === userId && !m.isRead).length;
        convMap.set(otherUserId, { otherUserId, lastMessage: msg, unreadCount });
      }
    }

    // Enrich with user info
    const conversations = [];
    for (const conv of Array.from(convMap.values())) {
      const user = await this.getUser(conv.otherUserId);
      if (user) {
        conversations.push({
          ...conv,
          user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
        });
      }
    }

    return conversations;
  }

  async getMessages(userId: number, otherUserId: number): Promise<Message[]> {
    return await db.select().from(messages)
      .where(or(
        and(eq(messages.senderId, userId), eq(messages.receiverId, otherUserId)),
        and(eq(messages.senderId, otherUserId), eq(messages.receiverId, userId))
      ))
      .orderBy(asc(messages.id));
  }

  async createMessage(senderId: number, message: InsertMessage): Promise<Message> {
    const rows = await db.insert(messages).values({
      senderId,
      receiverId: message.receiverId,
      bookId: message.bookId || null,
      content: message.content,
    }).returning();
    return rows[0];
  }

  async markMessagesRead(userId: number, senderId: number): Promise<void> {
    await db.update(messages)
      .set({ isRead: true })
      .where(and(eq(messages.senderId, senderId), eq(messages.receiverId, userId)));
  }

  async getUnreadCount(userId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.isRead, false)));
    return result[0]?.count || 0;
  }

  // Offers
  async getOffers(userId: number): Promise<{ sent: any[]; received: any[] }> {
    const sent = await db.select().from(offers).where(eq(offers.buyerId, userId)).orderBy(desc(offers.id));
    const received = await db.select().from(offers).where(eq(offers.sellerId, userId)).orderBy(desc(offers.id));

    const enrichOffer = async (offer: Offer) => {
      const book = await this.getBook(offer.bookId);
      const buyer = await this.getUser(offer.buyerId);
      const seller = await this.getUser(offer.sellerId);
      return {
        ...offer,
        book: book ? { id: book.id, title: book.title, author: book.author, coverUrl: book.coverUrl } : null,
        buyer: buyer ? { id: buyer.id, username: buyer.username, displayName: buyer.displayName } : null,
        seller: seller ? { id: seller.id, username: seller.username, displayName: seller.displayName } : null,
      };
    };

    return {
      sent: await Promise.all(sent.map(enrichOffer)),
      received: await Promise.all(received.map(enrichOffer)),
    };
  }

  async getOffer(id: number): Promise<Offer | undefined> {
    const rows = await db.select().from(offers).where(eq(offers.id, id));
    return rows[0];
  }

  async createOffer(buyerId: number, sellerId: number, offer: InsertOffer): Promise<Offer> {
    const rows = await db.insert(offers).values({
      buyerId,
      sellerId,
      bookId: offer.bookId,
      amount: offer.amount,
      message: offer.message || null,
    }).returning();
    return rows[0];
  }

  async updateOffer(id: number, userId: number, status: string, counterAmount?: number | null): Promise<Offer | undefined> {
    const offer = await this.getOffer(id);
    if (!offer || offer.sellerId !== userId) return undefined;

    const updates: any = { status };
    if (counterAmount !== undefined && counterAmount !== null) {
      updates.counterAmount = counterAmount;
    }

    const rows = await db.update(offers).set(updates).where(eq(offers.id, id)).returning();
    return rows[0];
  }
}

export const storage = new DatabaseStorage();
