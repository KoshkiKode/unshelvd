import {
  type User, type InsertUser, type Book, type InsertBook,
  type BookRequest, type InsertBookRequest, type Message, type InsertMessage,
  type Offer, type InsertOffer,
  users, books, bookRequests, messages, offers,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, or, like, desc, asc, gte, lte, sql } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

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
  getBooksByUser(userId: number): Promise<Book[]>;
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
  sort?: string;
  limit?: number;
  offset?: number;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.id, id)).get();
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.username, username)).get();
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return db.select().from(users).where(eq(users.email, email)).get();
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const now = new Date().toISOString();
    return db.insert(users).values({ ...insertUser, createdAt: now }).returning().get();
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    return db.update(users).set(data).where(eq(users.id, id)).returning().get();
  }

  // Books
  async getBook(id: number): Promise<Book | undefined> {
    return db.select().from(books).where(eq(books.id, id)).get();
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
      const term = `%${filters.search}%`;
      conditions.push(or(like(books.title, term), like(books.author, term)));
    }

    if (filters.genre) {
      conditions.push(like(books.genre, `%${filters.genre}%`));
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

    return query.all();
  }

  async getBooksByUser(userId: number): Promise<Book[]> {
    return db.select().from(books).where(eq(books.userId, userId)).orderBy(desc(books.id)).all();
  }

  async createBook(userId: number, book: InsertBook): Promise<Book> {
    const now = new Date().toISOString();
    return db.insert(books).values({ ...book, userId, createdAt: now }).returning().get();
  }

  async updateBook(id: number, userId: number, book: Partial<InsertBook>): Promise<Book | undefined> {
    return db.update(books).set(book).where(and(eq(books.id, id), eq(books.userId, userId))).returning().get();
  }

  async deleteBook(id: number, userId: number): Promise<boolean> {
    const result = db.delete(books).where(and(eq(books.id, id), eq(books.userId, userId))).run();
    return result.changes > 0;
  }

  // Book Requests
  async getBookRequests(filters?: { status?: string }): Promise<BookRequest[]> {
    if (filters?.status) {
      return db.select().from(bookRequests).where(eq(bookRequests.status, filters.status)).orderBy(desc(bookRequests.id)).all();
    }
    return db.select().from(bookRequests).orderBy(desc(bookRequests.id)).all();
  }

  async getBookRequest(id: number): Promise<BookRequest | undefined> {
    return db.select().from(bookRequests).where(eq(bookRequests.id, id)).get();
  }

  async createBookRequest(userId: number, request: InsertBookRequest): Promise<BookRequest> {
    const now = new Date().toISOString();
    return db.insert(bookRequests).values({ ...request, userId, createdAt: now }).returning().get();
  }

  async updateBookRequest(id: number, userId: number, data: Partial<BookRequest>): Promise<BookRequest | undefined> {
    return db.update(bookRequests).set(data).where(and(eq(bookRequests.id, id), eq(bookRequests.userId, userId))).returning().get();
  }

  // Messages
  async getConversations(userId: number): Promise<any[]> {
    // Get distinct conversations for this user
    const allMessages = db.select().from(messages)
      .where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))
      .orderBy(desc(messages.id))
      .all();

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
    for (const [, conv] of convMap) {
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
    return db.select().from(messages)
      .where(or(
        and(eq(messages.senderId, userId), eq(messages.receiverId, otherUserId)),
        and(eq(messages.senderId, otherUserId), eq(messages.receiverId, userId))
      ))
      .orderBy(asc(messages.id))
      .all();
  }

  async createMessage(senderId: number, message: InsertMessage): Promise<Message> {
    const now = new Date().toISOString();
    return db.insert(messages).values({
      senderId,
      receiverId: message.receiverId,
      bookId: message.bookId || null,
      content: message.content,
      createdAt: now,
    }).returning().get();
  }

  async markMessagesRead(userId: number, senderId: number): Promise<void> {
    db.update(messages)
      .set({ isRead: 1 })
      .where(and(eq(messages.senderId, senderId), eq(messages.receiverId, userId)))
      .run();
  }

  async getUnreadCount(userId: number): Promise<number> {
    const result = db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(and(eq(messages.receiverId, userId), eq(messages.isRead, 0)))
      .get();
    return result?.count || 0;
  }

  // Offers
  async getOffers(userId: number): Promise<{ sent: any[]; received: any[] }> {
    const sent = db.select().from(offers).where(eq(offers.buyerId, userId)).orderBy(desc(offers.id)).all();
    const received = db.select().from(offers).where(eq(offers.sellerId, userId)).orderBy(desc(offers.id)).all();

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
    return db.select().from(offers).where(eq(offers.id, id)).get();
  }

  async createOffer(buyerId: number, sellerId: number, offer: InsertOffer): Promise<Offer> {
    const now = new Date().toISOString();
    return db.insert(offers).values({
      buyerId,
      sellerId,
      bookId: offer.bookId,
      amount: offer.amount,
      message: offer.message || null,
      createdAt: now,
    }).returning().get();
  }

  async updateOffer(id: number, userId: number, status: string, counterAmount?: number | null): Promise<Offer | undefined> {
    const offer = await this.getOffer(id);
    if (!offer || offer.sellerId !== userId) return undefined;

    const updates: any = { status };
    if (counterAmount !== undefined && counterAmount !== null) {
      updates.counterAmount = counterAmount;
    }

    return db.update(offers).set(updates).where(eq(offers.id, id)).returning().get();
  }
}

export const storage = new DatabaseStorage();
