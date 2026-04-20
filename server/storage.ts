import {
  type User, type InsertUser, type Book, type InsertBook,
  type BookRequest, type InsertBookRequest, type Message, type InsertMessage,
  type Offer, type InsertOffer,
  type Conversation, type BlockRecord, type Report, type AuditLogEntry,
  users, books, bookRequests, messages, offers,
  conversations, blockRecords, reports, auditLog,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq, and, or, desc, asc, gte, lte, sql, ilike, inArray, isNull } from "drizzle-orm";
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

// Export pool for reuse (session store, rate limiter, etc.)
export { pool };

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
  getBookRequests(filters?: { status?: string; limit?: number; offset?: number }): Promise<{ requests: BookRequest[]; total: number }>;
  getBookRequest(id: number): Promise<BookRequest | undefined>;
  createBookRequest(userId: number, request: InsertBookRequest): Promise<BookRequest>;
  updateBookRequest(id: number, userId: number, data: Partial<BookRequest>): Promise<BookRequest | undefined>;
  deleteBookRequest(id: number, userId: number): Promise<boolean>;

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

  // Conversations
  getOrCreateConversation(bookId: number, buyerId: number, sellerId: number): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getUserConversations(userId: number): Promise<any[]>;
  updateConversationStatus(id: number, status: string): Promise<void>;

  // Blocks
  createBlock(blockerId: number, blockedId: number, reason?: string | null): Promise<BlockRecord>;
  getBlock(blockerId: number, blockedId: number): Promise<BlockRecord | undefined>;
  deleteBlock(blockerId: number, blockedId: number): Promise<void>;
  getUserBlocks(userId: number): Promise<BlockRecord[]>;
  isBlocked(userId1: number, userId2: number): Promise<boolean>;

  // Reports
  createReport(data: {
    reporterId: number;
    reportedUserId: number;
    messageId?: number | null;
    conversationId?: number | null;
    category: string;
    description?: string | null;
  }): Promise<Report>;
  getReports(filters?: { outcome?: string | null; limit?: number; offset?: number }): Promise<{ reports: any[]; total: number }>;
  getReport(id: number): Promise<any | undefined>;
  updateReport(id: number, adminId: number, outcome: string): Promise<Report | undefined>;

  // Audit log
  appendAuditLog(entry: {
    action: string;
    adminId?: number | null;
    targetUserId?: number | null;
    details?: string | null;
  }): Promise<void>;

  // Conversation messages
  getConversationMessages(conversationId: number): Promise<Message[]>;
  createConversationMessage(senderId: number, conversationId: number, content: string, bookId?: number | null): Promise<{ message: Message; isFirst: boolean }>;
  softDeleteMessage(messageId: number, senderId: number): Promise<boolean>;
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
  async getBookRequests(filters?: { status?: string; limit?: number; offset?: number }): Promise<{ requests: BookRequest[]; total: number }> {
    const limit = filters?.limit ?? 20;
    const offset = filters?.offset ?? 0;

    const where = filters?.status ? eq(bookRequests.status, filters.status) : undefined;

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(bookRequests).where(where),
      db.select().from(bookRequests).where(where).orderBy(desc(bookRequests.id)).limit(limit).offset(offset),
    ]);

    return { requests: rows, total: countResult[0]?.count ?? 0 };
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

  async deleteBookRequest(id: number, userId: number): Promise<boolean> {
    const rows = await db.delete(bookRequests).where(and(eq(bookRequests.id, id), eq(bookRequests.userId, userId))).returning();
    return rows.length > 0;
  }

  // Messages
  async getConversations(userId: number): Promise<any[]> {
    const allMessages = await db.select().from(messages)
      .where(or(eq(messages.senderId, userId), eq(messages.receiverId, userId)))
      .orderBy(desc(messages.id));

    const convMap = new Map<number, { otherUserId: number; lastMessage: Message; unreadCount: number }>();

    // Build unread counts in a single pass to avoid an O(n²) inner filter per conversation
    const unreadByPartner = new Map<number, number>();
    for (const msg of allMessages) {
      if (msg.senderId !== userId && msg.receiverId === userId && !msg.isRead) {
        unreadByPartner.set(msg.senderId, (unreadByPartner.get(msg.senderId) ?? 0) + 1);
      }
    }

    for (const msg of allMessages) {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!convMap.has(otherUserId)) {
        const unreadCount = unreadByPartner.get(otherUserId) ?? 0;
        convMap.set(otherUserId, { otherUserId, lastMessage: msg, unreadCount });
      }
    }

    // Batch-load all conversation partners in a single query
    const otherUserIds = Array.from(convMap.keys());
    if (otherUserIds.length === 0) return [];

    const partnerRows = await db.select().from(users).where(inArray(users.id, otherUserIds));
    const partnerMap = new Map(partnerRows.map(u => [u.id, u]));

    const conversations = [];
    for (const conv of Array.from(convMap.values())) {
      const user = partnerMap.get(conv.otherUserId);
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

    const allOffers = [...sent, ...received];
    if (allOffers.length === 0) return { sent: [], received: [] };

    // Batch-load all related books and users in 3 queries total
    const bookIds = [...new Set(allOffers.map(o => o.bookId))];
    const userIds = [...new Set(allOffers.flatMap(o => [o.buyerId, o.sellerId]))];

    const [bookRows, userRows] = await Promise.all([
      db.select().from(books).where(inArray(books.id, bookIds)),
      db.select().from(users).where(inArray(users.id, userIds)),
    ]);

    const bookMap = new Map(bookRows.map(b => [b.id, b]));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    const enrich = (offer: Offer) => {
      const book = bookMap.get(offer.bookId);
      const buyer = userMap.get(offer.buyerId);
      const seller = userMap.get(offer.sellerId);
      return {
        ...offer,
        book: book ? { id: book.id, title: book.title, author: book.author, coverUrl: book.coverUrl } : null,
        buyer: buyer ? { id: buyer.id, username: buyer.username, displayName: buyer.displayName } : null,
        seller: seller ? { id: seller.id, username: seller.username, displayName: seller.displayName } : null,
      };
    };

    return {
      sent: sent.map(enrich),
      received: received.map(enrich),
    };
  }

  async getOffer(id: number): Promise<Offer | undefined> {
    const rows = await db.select().from(offers).where(eq(offers.id, id));
    return rows[0];
  }

  async createOffer(buyerId: number, sellerId: number, offer: InsertOffer): Promise<Offer> {
    // Prevent duplicate pending offers from the same buyer for the same book.
    const [existing] = await db.select({ id: offers.id }).from(offers)
      .where(and(
        eq(offers.buyerId, buyerId),
        eq(offers.bookId, offer.bookId),
        eq(offers.status, "pending"),
      ))
      .limit(1);
    if (existing) {
      throw new Error("You already have a pending offer for this book");
    }

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
    if (!offer) return undefined;

    const isSeller = offer.sellerId === userId;
    const isBuyer = offer.buyerId === userId;
    if (!isSeller && !isBuyer) return undefined;

    // Sellers can respond to a pending offer (accept, decline, or counter).
    if (isSeller && offer.status !== "pending") return undefined;

    // Buyers can only accept or decline a countered offer — no counter-countering.
    if (isBuyer) {
      if (offer.status !== "countered") return undefined;
      if (status === "countered") return undefined;
    }

    // Prevent accepting an offer if the book already has another accepted offer
    if (status === "accepted") {
      const [existing] = await db.select().from(offers)
        .where(and(eq(offers.bookId, offer.bookId), eq(offers.status, "accepted")));
      if (existing && existing.id !== id) return undefined;
    }

    const updates: any = { status };
    if (counterAmount !== undefined && counterAmount !== null) {
      updates.counterAmount = counterAmount;
    }

    // Include the current status in the WHERE clause so a stale-read can never
    // silently overwrite a status that changed between the read above and this write.
    const rows = await db.update(offers).set(updates)
      .where(and(eq(offers.id, id), eq(offers.status, offer.status ?? "pending")))
      .returning();
    return rows[0];
  }

  // ── Conversations ────────────────────────────────────────────────────────

  async getOrCreateConversation(bookId: number, buyerId: number, sellerId: number): Promise<Conversation> {
    // Try to find existing conversation for this listing+buyer pair
    const existing = await db.select().from(conversations)
      .where(and(eq(conversations.bookId, bookId), eq(conversations.buyerId, buyerId)))
      .limit(1);
    if (existing[0]) return existing[0];

    const rows = await db.insert(conversations).values({
      bookId,
      buyerId,
      sellerId,
      status: "active",
    }).returning();
    return rows[0];
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  }

  async getUserConversations(userId: number): Promise<any[]> {
    const convRows = await db.select().from(conversations)
      .where(or(eq(conversations.buyerId, userId), eq(conversations.sellerId, userId)))
      .orderBy(desc(conversations.id));

    if (convRows.length === 0) return [];

    const userIds = [...new Set(convRows.flatMap(c => [c.buyerId, c.sellerId]))];
    const bookIds = [...new Set(convRows.map(c => c.bookId))];

    const [userRows, bookRows] = await Promise.all([
      db.select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
        .from(users).where(inArray(users.id, userIds)),
      db.select({ id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl })
        .from(books).where(inArray(books.id, bookIds)),
    ]);

    const userMap = new Map(userRows.map(u => [u.id, u]));
    const bookMap = new Map(bookRows.map(b => [b.id, b]));

    // Get last message per conversation
    const convIds = convRows.map(c => c.id);
    const lastMsgs = await db.select().from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(desc(messages.id));

    const lastMsgMap = new Map<number, Message>();
    for (const msg of lastMsgs) {
      if (msg.conversationId && !lastMsgMap.has(msg.conversationId)) {
        lastMsgMap.set(msg.conversationId, msg);
      }
    }

    // Unread counts per conversation for this user
    const unreadRows = await db.select({
      conversationId: messages.conversationId,
      cnt: sql<number>`count(*)::int`,
    }).from(messages)
      .where(and(
        inArray(messages.conversationId, convIds),
        eq(messages.receiverId, userId),
        eq(messages.isRead, false),
      ))
      .groupBy(messages.conversationId);
    const unreadMap = new Map(unreadRows.map(r => [r.conversationId, r.cnt]));

    return convRows.map(conv => {
      const otherUserId = conv.buyerId === userId ? conv.sellerId : conv.buyerId;
      return {
        ...conv,
        otherUser: userMap.get(otherUserId) ?? null,
        book: bookMap.get(conv.bookId) ?? null,
        lastMessage: lastMsgMap.get(conv.id) ?? null,
        unreadCount: unreadMap.get(conv.id) ?? 0,
      };
    });
  }

  async updateConversationStatus(id: number, status: string): Promise<void> {
    await db.update(conversations)
      .set({ status, ...(status !== "active" ? { closedAt: new Date() } : {}) })
      .where(eq(conversations.id, id));
  }

  // ── Blocks ───────────────────────────────────────────────────────────────

  async createBlock(blockerId: number, blockedId: number, reason?: string | null): Promise<BlockRecord> {
    // Upsert — if already blocked, return existing row
    const existing = await db.select().from(blockRecords)
      .where(and(eq(blockRecords.blockerId, blockerId), eq(blockRecords.blockedId, blockedId)))
      .limit(1);
    if (existing[0]) return existing[0];

    const rows = await db.insert(blockRecords).values({ blockerId, blockedId, reason: reason ?? null }).returning();
    return rows[0];
  }

  async getBlock(blockerId: number, blockedId: number): Promise<BlockRecord | undefined> {
    const rows = await db.select().from(blockRecords)
      .where(and(eq(blockRecords.blockerId, blockerId), eq(blockRecords.blockedId, blockedId)))
      .limit(1);
    return rows[0];
  }

  async deleteBlock(blockerId: number, blockedId: number): Promise<void> {
    await db.delete(blockRecords)
      .where(and(eq(blockRecords.blockerId, blockerId), eq(blockRecords.blockedId, blockedId)));
  }

  async getUserBlocks(userId: number): Promise<BlockRecord[]> {
    return db.select().from(blockRecords).where(eq(blockRecords.blockerId, userId));
  }

  async isBlocked(userId1: number, userId2: number): Promise<boolean> {
    const rows = await db.select({ id: blockRecords.id }).from(blockRecords)
      .where(or(
        and(eq(blockRecords.blockerId, userId1), eq(blockRecords.blockedId, userId2)),
        and(eq(blockRecords.blockerId, userId2), eq(blockRecords.blockedId, userId1)),
      ))
      .limit(1);
    return rows.length > 0;
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async createReport(data: {
    reporterId: number;
    reportedUserId: number;
    messageId?: number | null;
    conversationId?: number | null;
    category: string;
    description?: string | null;
  }): Promise<Report> {
    const rows = await db.insert(reports).values({
      reporterId: data.reporterId,
      reportedUserId: data.reportedUserId,
      messageId: data.messageId ?? null,
      conversationId: data.conversationId ?? null,
      category: data.category,
      description: data.description ?? null,
    }).returning();
    return rows[0];
  }

  async getReports(filters?: { outcome?: string | null; limit?: number; offset?: number }): Promise<{ reports: any[]; total: number }> {
    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    // null outcome = pending review
    const where = filters?.outcome === undefined
      ? isNull(reports.outcome)
      : filters.outcome === null
        ? isNull(reports.outcome)
        : eq(reports.outcome, filters.outcome);

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(reports).where(where),
      db.select().from(reports).where(where).orderBy(desc(reports.id)).limit(limit).offset(offset),
    ]);

    if (rows.length === 0) return { reports: [], total: countResult[0]?.count ?? 0 };

    const userIds = [...new Set(rows.flatMap(r => [r.reporterId, r.reportedUserId]))];
    const userRows = await db.select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    const enriched = rows.map(r => ({
      ...r,
      reporter: userMap.get(r.reporterId) ?? null,
      reportedUser: userMap.get(r.reportedUserId) ?? null,
    }));

    return { reports: enriched, total: countResult[0]?.count ?? 0 };
  }

  async getReport(id: number): Promise<any | undefined> {
    const rows = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
    if (!rows[0]) return undefined;

    const r = rows[0];
    const userIds = [...new Set([r.reporterId, r.reportedUserId])];
    const userRows = await db.select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    // Fetch conversation messages if conversationId is set (admin context)
    let conversationMessages: Message[] = [];
    if (r.conversationId) {
      conversationMessages = await db.select().from(messages)
        .where(eq(messages.conversationId, r.conversationId))
        .orderBy(asc(messages.id));
    }

    return {
      ...r,
      reporter: userMap.get(r.reporterId) ?? null,
      reportedUser: userMap.get(r.reportedUserId) ?? null,
      conversationMessages,
    };
  }

  async updateReport(id: number, adminId: number, outcome: string): Promise<Report | undefined> {
    const rows = await db.update(reports)
      .set({ outcome, reviewedByAdmin: adminId, reviewedAt: new Date() })
      .where(eq(reports.id, id))
      .returning();
    return rows[0];
  }

  // ── Audit log ────────────────────────────────────────────────────────────

  async appendAuditLog(entry: {
    action: string;
    adminId?: number | null;
    targetUserId?: number | null;
    details?: string | null;
  }): Promise<void> {
    await db.insert(auditLog).values({
      action: entry.action,
      adminId: entry.adminId ?? null,
      targetUserId: entry.targetUserId ?? null,
      details: entry.details ?? null,
    });
  }

  // ── Conversation messages ────────────────────────────────────────────────

  async getConversationMessages(conversationId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.id));
  }

  async createConversationMessage(
    senderId: number,
    conversationId: number,
    content: string,
    bookId?: number | null,
  ): Promise<{ message: Message; isFirst: boolean }> {
    // Check if this is the first message in the conversation
    const [existingCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    const isFirst = (existingCount?.count ?? 0) === 0;

    // Get conversation to find receiverId
    const conv = await this.getConversation(conversationId);
    if (!conv) throw new Error("Conversation not found");
    const receiverId = conv.buyerId === senderId ? conv.sellerId : conv.buyerId;

    const rows = await db.insert(messages).values({
      senderId,
      receiverId,
      bookId: bookId ?? null,
      conversationId,
      content,
    }).returning();

    return { message: rows[0], isFirst };
  }

  async softDeleteMessage(messageId: number, senderId: number): Promise<boolean> {
    const rows = await db.update(messages)
      .set({ deletedBySender: true })
      .where(and(eq(messages.id, messageId), eq(messages.senderId, senderId)))
      .returning({ id: messages.id });
    return rows.length > 0;
  }
}

export const storage = new DatabaseStorage();
