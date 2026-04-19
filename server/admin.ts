/**
 * Unshelv'd — Admin API
 *
 * Business management endpoints for:
 * - Revenue & fee tracking
 * - Transaction management (view all, disputes, refunds)
 * - User management (view, suspend, stats)
 * - Platform analytics
 * - Payout tracking (what you owe sellers, what's your cut)
 * - Platform settings (Stripe, PayPal, feature flags)
 */

import type { Express, Request, Response, NextFunction } from "express";
import { spawn } from "child_process";
import { z } from "zod";
import { db, storage } from "./storage";
import {
  users,
  books,
  bookRequests,
  transactions,
  bookCatalog,
  works,
  messages,
  auditLog,
} from "@shared/schema";
import { eq, desc, sql, and, ne, gte, lte, count, inArray, isNull } from "drizzle-orm";
import { refundPayment, adminReleaseToSeller } from "./payments";
import {
  getAllSettings,
  setSettings,
  SECRET_KEYS,
  maskSecret,
} from "./platform-settings";
import { invalidateEmailCache, sendDisputeResolved } from "./email";
import { parseIntParam } from "./security";

// Admin-only middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Exhaustive allowlist of setting keys the admin is permitted to write.
// Any key not in this list is silently dropped to prevent arbitrary data injection.
const ALLOWED_SETTING_KEYS = new Set([
  "stripe_enabled",
  "stripe_secret_key",
  "stripe_publishable_key",
  "stripe_webhook_secret",
  "paypal_enabled",
  "paypal_client_id",
  "paypal_client_secret",
  "paypal_mode",
  "paypal_webhook_id",
  "platform_fee_percent",
  "maintenance_mode",
  "registrations_enabled",
  "email_enabled",
  "email_smtp_host",
  "email_smtp_port",
  "email_smtp_user",
  "email_smtp_pass",
  "email_from",
]);

export function registerAdminRoutes(app: Express) {
  // ═══ Platform Overview ═══
  app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
    try {
      const [userCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      const [bookCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(books);
      const [catalogCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookCatalog);
      const [workCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(works);
      const [requestCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookRequests);
      const [messageCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages);

      // Transaction stats
      const [txStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          totalRevenue: sql<number>`coalesce(sum(amount), 0)`,
          totalFees: sql<number>`coalesce(sum(platform_fee), 0)`,
          totalPayouts: sql<number>`coalesce(sum(seller_payout), 0)`,
          completed: sql<number>`count(*) filter (where status = 'completed')::int`,
          pending: sql<number>`count(*) filter (where status = 'pending')::int`,
          paid: sql<number>`count(*) filter (where status = 'paid')::int`,
          shipped: sql<number>`count(*) filter (where status = 'shipped')::int`,
          disputed: sql<number>`count(*) filter (where status = 'disputed')::int`,
        })
        .from(transactions);

      // Active listings (for-sale + open-to-offers)
      const [activeListings] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(books)
        .where(sql`status in ('for-sale', 'open-to-offers')`);

      // Users registered in last 7 days
      const [newUsers] = await db
        .select({ count: sql<number>`count(*)::int` })
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
          platformFees: Number(txStats.totalFees).toFixed(2), // YOUR money
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
      const results = await query
        .orderBy(desc(transactions.id))
        .limit(limit)
        .offset(offset);

      // Enrich with user and book info (batch-load to avoid N+1 queries)
      const userIds = [...new Set(results.flatMap((tx) => [tx.buyerId, tx.sellerId]))];
      const bookIds = [...new Set(results.map((tx) => tx.bookId))];
      const [userRows, bookRows] = await Promise.all([
        userIds.length > 0
          ? db.select({ id: users.id, username: users.username, displayName: users.displayName, email: users.email })
              .from(users).where(inArray(users.id, userIds))
          : Promise.resolve([]),
        bookIds.length > 0
          ? db.select({ id: books.id, title: books.title, author: books.author })
              .from(books).where(inArray(books.id, bookIds))
          : Promise.resolve([]),
      ]);
      const userMap = new Map(userRows.map((u) => [u.id, u]));
      const bookMap = new Map(bookRows.map((b) => [b.id, b]));
      const enriched = results.map((tx) => ({
        ...tx,
        buyer: userMap.get(tx.buyerId),
        seller: userMap.get(tx.sellerId),
        book: bookMap.get(tx.bookId),
      }));

      const countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(transactions);
      const [{ count: total }] = status
        ? await (countQuery.where(eq(transactions.status, status)) as any)
        : await countQuery;

      return res.json({ transactions: enriched, total, limit, offset });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // ═══ Revenue Breakdown (monthly) ═══
  app.get("/api/admin/revenue", requireAdmin, async (_req, res) => {
    try {
      const monthly = await db
        .select({
          month: sql<string>`to_char(created_at, 'YYYY-MM')`,
          sales: sql<number>`count(*)::int`,
          revenue: sql<number>`coalesce(sum(amount), 0)`,
          fees: sql<number>`coalesce(sum(platform_fee), 0)`,
          payouts: sql<number>`coalesce(sum(seller_payout), 0)`,
        })
        .from(transactions)
        .where(eq(transactions.status, "completed"))
        .groupBy(sql`to_char(created_at, 'YYYY-MM')`)
        .orderBy(desc(sql`to_char(created_at, 'YYYY-MM')`))
        .limit(12);

      // Pending payouts (paid + shipped but not completed)
      const [pendingPayouts] = await db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<number>`coalesce(sum(seller_payout), 0)`,
        })
        .from(transactions)
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

      const results = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          email: users.email,
          role: users.role,
          rating: users.rating,
          totalSales: users.totalSales,
          totalPurchases: users.totalPurchases,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.id))
        .limit(limit)
        .offset(offset);

      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);

      return res.json({ users: results, total, limit, offset });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ═══ User Detail (admin view) ═══
  app.get("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid user ID" });
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          email: users.email,
          role: users.role,
          bio: users.bio,
          location: users.location,
          rating: users.rating,
          totalSales: users.totalSales,
          totalPurchases: users.totalPurchases,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, id));

      if (!user) return res.status(404).json({ message: "User not found" });

      // Get their books and transactions
      const userBooks = await db
        .select()
        .from(books)
        .where(eq(books.userId, id));
      const userTx = await db
        .select()
        .from(transactions)
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
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid user ID" });
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.role === "admin")
        return res.status(400).json({ message: "Cannot suspend an admin" });

      const newRole = user.role === "suspended" ? "user" : "suspended";
      await db.update(users).set({ role: newRole }).where(eq(users.id, id));

      return res.json({
        message: `User ${newRole === "suspended" ? "suspended" : "unsuspended"}`,
        role: newRole,
      });
    } catch (err) {
      return res.status(500).json({ message: "Action failed" });
    }
  });

  // ═══ Mark transaction as disputed ═══
  app.post(
    "/api/admin/transactions/:id/dispute",
    requireAdmin,
    async (req, res) => {
      try {
        const id = parseIntParam(req.params.id);
        if (!id) return res.status(400).json({ message: "Invalid transaction ID" });
        await db
          .update(transactions)
          .set({ status: "disputed", updatedAt: new Date() })
          .where(eq(transactions.id, id));
        return res.json({ message: "Transaction marked as disputed" });
      } catch (err) {
        return res.status(500).json({ message: "Action failed" });
      }
    },
  );

  // ═══ Refund a transaction ═══
  app.post(
    "/api/admin/transactions/:id/refund",
    requireAdmin,
    async (req, res) => {
      try {
        const id = parseIntParam(req.params.id);
        if (!id) return res.status(400).json({ message: "Invalid transaction ID" });
        await refundPayment(id);
        return res.json({ message: "Transaction refunded" });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Refund failed" });
      }
    },
  );

  // ═══ Resolve a disputed transaction ═══
  // resolution="refund_buyer"      → refund the buyer (Stripe refund / PayPal void)
  // resolution="release_to_seller" → pay the seller (Stripe transfer / PayPal capture)
  app.post(
    "/api/admin/disputes/:id/resolve",
    requireAdmin,
    async (req, res) => {
      try {
        const id = parseIntParam(req.params.id);
        if (!id) return res.status(400).json({ message: "Invalid transaction ID" });

        const { resolution } = req.body as { resolution?: string };
        if (resolution !== "refund_buyer" && resolution !== "release_to_seller") {
          return res.status(400).json({
            message: "resolution must be 'refund_buyer' or 'release_to_seller'",
          });
        }

        // Verify it's actually disputed
        const [tx] = await db.select().from(transactions).where(eq(transactions.id, id));
        if (!tx) return res.status(404).json({ message: "Transaction not found" });
        if (tx.status !== "disputed") {
          return res.status(400).json({ message: "Transaction is not disputed" });
        }

        if (resolution === "refund_buyer") {
          await refundPayment(id);
        } else {
          await adminReleaseToSeller(id);
        }

        // Notify both parties (fire-and-forget)
        const [buyer] = await db.select({ email: users.email }).from(users).where(eq(users.id, tx.buyerId));
        const [seller] = await db.select({ email: users.email }).from(users).where(eq(users.id, tx.sellerId));
        const [book] = await db.select({ title: books.title }).from(books).where(eq(books.id, tx.bookId));
        const emailResolution = resolution === "refund_buyer" ? "refunded" : "released_to_seller" as const;
        if (book) {
          if (buyer?.email) {
            sendDisputeResolved(buyer.email, "buyer", book.title, emailResolution).catch((err) =>
              console.error("[email] dispute-resolved buyer notification failed:", err),
            );
          }
          if (seller?.email) {
            sendDisputeResolved(seller.email, "seller", book.title, emailResolution).catch((err) =>
              console.error("[email] dispute-resolved seller notification failed:", err),
            );
          }
        }

        return res.json({
          message: resolution === "refund_buyer"
            ? "Dispute resolved — buyer refunded"
            : "Dispute resolved — payment released to seller",
        });
      } catch (err: any) {
        console.error("[admin] dispute resolution failed:", err);
        return res.status(500).json({ message: err.message || "Dispute resolution failed" });
      }
    },
  );

  // ═══ Check admin status ═══
  app.get("/api/admin/check", requireAdmin, async (req, res) => {
    return res.json({ isAdmin: true, userId: req.user!.id });
  });

  // 🏃‍♂️ Catalog Seeder (run from admin panel)
  app.post("/api/admin/seed", requireAdmin, async (req, res) => {
    const { queries } = req.body;
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return res
        .status(400)
        .json({ message: "Please provide a list of queries." });
    }

    // Validate each query: max 50 items, each a plain text string (≤ 100 chars,
    // only letters/digits/spaces/common punctuation — no shell metacharacters).
    // spawn() does NOT use a shell so there is no injection risk, but we validate
    // here for defense-in-depth and to prevent the args being used maliciously if
    // the Python script is ever updated to read sys.argv.
    if (queries.length > 50) {
      return res.status(400).json({ message: "Too many queries (max 50)" });
    }
    const SAFE_QUERY_REGEX = /^[\w\s',.\-\u00C0-\u024F\u0400-\u04FF]{1,100}$/u;
    for (const q of queries) {
      if (typeof q !== "string" || !SAFE_QUERY_REGEX.test(q)) {
        return res.status(400).json({ message: `Invalid query value: "${String(q).slice(0, 50)}"` });
      }
    }

    try {
      // Run the python script in the background (uses the hardcoded QUERIES list
      // inside the script — user-supplied queries are validated but not currently
      // consumed by the script; they are reserved for future use).
      const pythonProcess = spawn(
        "python3",
        ["scripts/seed-catalog.py", ...queries],
        {
          detached: true,
          stdio: "ignore",
          env: { ...process.env },
        },
      );
      pythonProcess.unref();

      return res
        .status(202)
        .json({
          message: "Catalog seeding process started in the background.",
        });
    } catch (err: any) {
      console.error("Failed to start seeder:", err);
      return res
        .status(500)
        .json({ message: `Failed to start seeder: ${err.message}` });
    }
  });

  // ═══ Platform Settings ═══

  /**
   * GET /api/admin/settings
   * Returns all platform settings.  Secret values (keys, tokens) are masked
   * so they are safe to send to the browser without exposing raw credentials.
   */
  app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
    try {
      const raw = await getAllSettings();
      const masked: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(raw)) {
        masked[key] = SECRET_KEYS.has(key) ? maskSecret(value) : value;
      }
      return res.json(masked);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch settings" });
    }
  });

  /**
   * PUT /api/admin/settings
   * Upserts platform settings.  Blank values for secret fields are ignored
   * so that existing secrets are preserved when the admin submits without
   * re-entering them (masked placeholder values).
   *
   * Body: Record<string, string>
   */
  app.put("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const incoming = req.body as Record<string, string>;
      if (typeof incoming !== "object" || Array.isArray(incoming)) {
        return res.status(400).json({ message: "Body must be a JSON object" });
      }

      // Masked placeholder pattern: one or more bullet characters followed by
      // 1–4 non-bullet characters (e.g. "••••••••abcd").  We skip these so
      // that existing secrets are preserved when the admin submits without
      // re-entering them.
      const maskedPattern = /^•+[^•]{1,4}$/;

      const toSave: Record<string, string | null> = {};
      for (const [key, value] of Object.entries(incoming)) {
        // Only allow known setting keys
        if (!ALLOWED_SETTING_KEYS.has(key)) continue;
        if (SECRET_KEYS.has(key)) {
          // Skip blank or masked placeholder — keep the existing DB value
          if (!value || value === "" || maskedPattern.test(value)) continue;
        }
        // Validate numeric range for platform_fee_percent (must be 0–100)
        if (key === "platform_fee_percent") {
          const num = parseFloat(value as string);
          if (isNaN(num) || num < 0 || num > 100) {
            return res.status(400).json({ message: "platform_fee_percent must be a number between 0 and 100" });
          }
        }
        toSave[key] = typeof value === "string" && value !== "" ? value : null;
      }

      if (Object.keys(toSave).length > 0) {
        await setSettings(toSave);

        // Invalidate the email transporter cache if any email setting changed
        const emailKeys = ["email_enabled", "email_smtp_host", "email_smtp_port", "email_smtp_user", "email_smtp_pass", "email_from"];
        if (emailKeys.some((k) => k in toSave)) {
          invalidateEmailCache();
        }
      }

      return res.json({ message: "Settings saved" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to save settings" });
    }
  });

  // ═══ Admin self-service credential management ═══

  /**
   * PATCH /api/admin/me/credentials
   * Allows the admin to change their own username and/or email address.
   * Password changes use the shared /api/auth/change-password endpoint.
   * Body: { username?: string, email?: string }
   */
  app.patch("/api/admin/me/credentials", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        username: z
          .string()
          .min(3)
          .max(30)
          .trim()
          .regex(
            /^[\p{L}\p{N}_.-]+$/u,
            "Username can only contain letters, numbers, underscores, dots, and hyphens",
          )
          .optional(),
        email: z.string().email("Invalid email address").optional(),
      });

      const data = schema.parse(req.body);
      if (!data.username && !data.email) {
        return res.status(400).json({ message: "Provide at least one field to update (username or email)" });
      }

      const adminId = req.user!.id;

      // Check uniqueness before updating
      if (data.username) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, data.username), ne(users.id, adminId)));
        if (existing) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }
      if (data.email) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, data.email), ne(users.id, adminId)));
        if (existing) {
          return res.status(400).json({ message: "Email already registered" });
        }
      }

      const updateFields: Record<string, string> = {};
      if (data.username) updateFields.username = data.username;
      if (data.email) updateFields.email = data.email;

      await db.update(users).set(updateFields).where(eq(users.id, adminId));

      return res.json({ message: "Credentials updated" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to update credentials" });
    }
  });

  // ═══ Reports — list open reports ═══
  app.get("/api/admin/reports", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const outcome = (req.query.outcome as string) || null; // null = open/pending
      const result = await storage.getReports({ outcome, limit, offset });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // ═══ Reports — get single report with full conversation context ═══
  app.get("/api/admin/reports/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid report ID" });
      const report = await storage.getReport(id);
      if (!report) return res.status(404).json({ message: "Report not found" });
      return res.json(report);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  // ═══ Reports — review action ═══
  // outcome: dismissed | warned | temp_banned | banned | escalated
  app.put("/api/admin/reports/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid report ID" });

      const outcome: string = req.body?.outcome;
      const validOutcomes = ["dismissed", "warned", "temp_banned", "banned", "escalated"];
      if (!outcome || !validOutcomes.includes(outcome))
        return res.status(400).json({ message: `outcome must be one of: ${validOutcomes.join(", ")}` });

      const report = await storage.updateReport(id, req.user!.id, outcome);
      if (!report) return res.status(404).json({ message: "Report not found" });

      // Apply user-level actions
      if (outcome === "banned") {
        await db.update(users).set({ role: "suspended" }).where(eq(users.id, report.reportedUserId));
      } else if (outcome === "temp_banned") {
        // Mark suspended; a background job or manual restore handles the temp period
        await db.update(users).set({ role: "suspended" }).where(eq(users.id, report.reportedUserId));
      }

      await storage.appendAuditLog({
        action: `admin_review_${outcome}`,
        adminId: req.user!.id,
        targetUserId: report.reportedUserId,
        details: JSON.stringify({ reportId: id, outcome }),
      });

      return res.json(report);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update report" });
    }
  });

  // ═══ Audit Log ═══
  app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const rows = await db.select().from(auditLog)
        .orderBy(desc(auditLog.id))
        .limit(limit)
        .offset(offset);
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(auditLog);
      return res.json({ entries: rows, total, limit, offset });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch audit log" });
    }
  });
}
