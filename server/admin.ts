/**
 * Unshelv'd — Admin API
 * 
 * Business management endpoints for:
 * - Revenue & fee tracking
 * - Transaction management (view all, disputes, refunds)
 * - User management (view, suspend, stats)
 * - Platform analytics
 * - Payout tracking (what you owe sellers, what's your cut)
 */

import type { Express, Request, Response, NextFunction } from "express";
import { db } from "./storage";
import { users, books, bookRequests, transactions, bookCatalog, works, messages } from "@shared/schema";
import { eq, desc, sql, and, gte, lte, count } from "drizzle-orm";

// Admin-only middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if ((req.user as any).role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export function registerAdminRoutes(app: Express) {

  // ═══ Platform Overview ═══
  app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
    try {
      const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const [bookCount] = await db.select({ count: sql<number>`count(*)::int` }).from(books);
      const [catalogCount] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);
      const [workCount] = await db.select({ count: sql<number>`count(*)::int` }).from(works);
      const [requestCount] = await db.select({ count: sql<number>`count(*)::int` }).from(bookRequests);
      const [messageCount] = await db.select({ count: sql<number>`count(*)::int` }).from(messages);

      // Transaction stats
      const [txStats] = await db.select({
        total: sql<number>`count(*)::int`,
        totalRevenue: sql<number>`coalesce(sum(amount), 0)`,
        totalFees: sql<number>`coalesce(sum(platform_fee), 0)`,
        totalPayouts: sql<number>`coalesce(sum(seller_payout), 0)`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        paid: sql<number>`count(*) filter (where status = 'paid')::int`,
        shipped: sql<number>`count(*) filter (where status = 'shipped')::int`,
        disputed: sql<number>`count(*) filter (where status = 'disputed')::int`,
      }).from(transactions);

      // Active listings (for-sale + open-to-offers)
      const [activeListings] = await db.select({ count: sql<number>`count(*)::int` })
        .from(books)
        .where(sql`status in ('for-sale', 'open-to-offers')`);

      // Users registered in last 7 days
      const [newUsers] = await db.select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(gte(users.createdAt, sql`now() - interval '7 days'`));

      return res.json({
        users: userCount.count,
        newUsersLast7Days: newUsers.count,
        books: bookCount.count,
        activeListings: activeListings.count,
        catalog: catalogCount.count,
        works: workCount.count,
        requests: requestCount.count,
        messages: messageCount.count,
        transactions: {
          total: txStats.total,
          completed: txStats.completed,
          pending: txStats.pending,
          paid: txStats.paid,
          shipped: txStats.shipped,
          disputed: txStats.disputed,
        },
        revenue: {
          totalSales: Number(txStats.totalRevenue).toFixed(2),
          platformFees: Number(txStats.totalFees).toFixed(2),   // YOUR money
          sellerPayouts: Number(txStats.totalPayouts).toFixed(2), // Owed to sellers
        },
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch overview" });
    }
  });

  // ═══ All Transactions ═══
  app.get("/api/admin/transactions", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;

      let query = db.select().from(transactions);
      if (status) query = query.where(eq(transactions.status, status)) as any;
      const results = await query.orderBy(desc(transactions.id)).limit(limit).offset(offset);

      // Enrich with user and book info
      const enriched = await Promise.all(results.map(async (tx) => {
        const [buyer] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, tx.buyerId));
        const [seller] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, tx.sellerId));
        const [book] = await db.select({ id: books.id, title: books.title, author: books.author }).from(books).where(eq(books.id, tx.bookId));
        return { ...tx, buyer, seller, book };
      }));

      const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` }).from(transactions);

      return res.json({ transactions: enriched, total, limit, offset });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // ═══ Revenue Breakdown (monthly) ═══
  app.get("/api/admin/revenue", requireAdmin, async (_req, res) => {
    try {
      const monthly = await db.select({
        month: sql<string>`to_char(created_at, 'YYYY-MM')`,
        sales: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(amount), 0)`,
        fees: sql<number>`coalesce(sum(platform_fee), 0)`,
        payouts: sql<number>`coalesce(sum(seller_payout), 0)`,
      }).from(transactions)
        .where(eq(transactions.status, "completed"))
        .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
        .orderBy(desc(sql`to_char(created_at, 'YYYY-MM')`))
        .limit(12);

      // Pending payouts (paid + shipped but not completed)
      const [pendingPayouts] = await db.select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(seller_payout), 0)`,
      }).from(transactions)
        .where(sql`status in ('paid', 'shipped')`);

      return res.json({
        monthly,
        pendingPayouts: {
          count: pendingPayouts.count,
          total: Number(pendingPayouts.total).toFixed(2),
        },
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch revenue" });
    }
  });

  // ═══ All Users ═══
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const results = await db.select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        rating: users.rating,
        totalSales: users.totalSales,
        totalPurchases: users.totalPurchases,
        createdAt: users.createdAt,
      }).from(users)
        .orderBy(desc(users.id))
        .limit(limit)
        .offset(offset);

      const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

      return res.json({ users: results, total, limit, offset });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ═══ User Detail (admin view) ═══
  app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [user] = await db.select({
        id: users.id, username: users.username, displayName: users.displayName,
        email: users.email, role: users.role, bio: users.bio, location: users.location,
        rating: users.rating, totalSales: users.totalSales, totalPurchases: users.totalPurchases,
        createdAt: users.createdAt,
      }).from(users).where(eq(users.id, id));

      if (!user) return res.status(404).json({ message: "User not found" });

      // Get their books and transactions
      const userBooks = await db.select().from(books).where(eq(books.userId, id));
      const userTx = await db.select().from(transactions)
        .where(sql`buyer_id = ${id} or seller_id = ${id}`)
        .orderBy(desc(transactions.id));

      return res.json({ user, books: userBooks, transactions: userTx });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ═══ Suspend/Unsuspend User ═══
  app.post("/api/admin/users/:id/suspend", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === "admin") return res.status(400).json({ message: "Cannot suspend an admin" });

      const newRole = user.role === "suspended" ? "user" : "suspended";
      await db.update(users).set({ role: newRole }).where(eq(users.id, id));

      return res.json({ message: `User ${newRole === "suspended" ? "suspended" : "unsuspended"}`, role: newRole });
    } catch (err) {
      return res.status(500).json({ message: "Action failed" });
    }
  });

  // ═══ Mark transaction as disputed ═══
  app.post("/api/admin/transactions/:id/dispute", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.update(transactions).set({ status: "disputed", updatedAt: new Date() }).where(eq(transactions.id, id));
      return res.json({ message: "Transaction marked as disputed" });
    } catch (err) {
      return res.status(500).json({ message: "Action failed" });
    }
  });

  // ═══ Refund a transaction ═══
  app.post("/api/admin/transactions/:id/refund", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
      if (!tx) return res.status(404).json({ message: "Transaction not found" });

      // In production, issue Stripe refund here:
      // if (tx.stripePaymentIntentId) {
      //   await stripe.refunds.create({ payment_intent: tx.stripePaymentIntentId });
      // }

      await db.update(transactions).set({ status: "refunded", updatedAt: new Date() }).where(eq(transactions.id, id));

      // Re-list the book
      await db.update(books).set({ status: "for-sale" }).where(eq(books.id, tx.bookId));

      return res.json({ message: "Transaction refunded" });
    } catch (err) {
      return res.status(500).json({ message: "Refund failed" });
    }
  });

  // ═══ Check admin status ═══
  app.get("/api/admin/check", requireAdmin, async (req, res) => {
    return res.json({ isAdmin: true, userId: (req.user as any).id });
  });
}
