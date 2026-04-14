import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, pool, db } from "./storage";
import {
  insertUserSchema,
  loginSchema,
  insertBookSchema,
  insertBookRequestSchema,
  insertMessageSchema,
  insertOfferSchema,
  updateOfferSchema,
  books,
  bookCatalog,
  works,
  users,
  transactions,
} from "@shared/schema";
import { eq, and, or, ilike, desc, asc, sql, isNull } from "drizzle-orm";
import { resolveWork, getWorkEditions, updateWorkStats } from "./work-resolver";
import {
  createPaymentIntent,
  confirmPayment,
  failPayment,
  handleSellerAccountUpdated,
  handleTransferFailed,
  handleChargeRefunded,
  markShipped,
  confirmDelivery,
  refundPayment,
  getUserTransactions,
  PLATFORM_FEE_PERCENT,
  createSellerAccount,
  checkSellerStatus,
  getStripe,
  isStripeEnabled,
  calculateFees,
} from "./payments";
import {
  createPayPalOrder,
  authorizePayPalOrder,
  isPayPalEnabled,
  verifyPayPalWebhookSignature,
  voidPayPalAuthorization,
} from "./paypal";
import { registerAdminRoutes } from "./admin";
import { getSetting, isEnabled } from "./platform-settings";
import { validatePassword } from "@shared/password-policy";
import { sanitizeLikeInput, parseIntParam } from "./security";
import {
  sendPasswordReset,
  sendWelcome,
  sendNewOffer,
  sendOfferUpdated,
  sendPaymentReceived,
  sendBookShipped,
  sendDeliveryConfirmed,
  sendNewMessage,
  sendMatchedListing,
  sendEmailVerification,
  sendDisputeOpened,
  sendOrderCancelled,
} from "./email";
import { z, ZodError } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const PgSessionStore = connectPgSimple(session);
const MemoryStore = createMemoryStore(session);

// Extend express session
declare module "express-session" {
  interface SessionData {
    passport: { user: number };
  }
}

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      displayName: string;
      email: string;
      bio: string | null;
      avatarUrl: string | null;
      location: string | null;
      rating: number | null;
      totalSales: number | null;
      totalPurchases: number | null;
      role: string | null;
      emailVerified: boolean | null;
      emailVerifyToken: string | null;
      emailVerifyExpiry: Date | null;
      createdAt: string | null;
    }
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  const role = req.user?.role;
  if (role === "suspended") {
    return res.status(403).json({ message: "Account suspended" });
  }
  if (role === "deleted") {
    return res.status(403).json({ message: "Account deleted" });
  }
  next();
}

function parsePagination(
  limitRaw: string | undefined,
  offsetRaw: string | undefined,
  defaults: { limit: number; maxLimit: number; offset: number } = {
    limit: 20,
    maxLimit: 100,
    offset: 0,
  },
) {
  const parsedLimit = Number.parseInt(limitRaw ?? "", 10);
  const parsedOffset = Number.parseInt(offsetRaw ?? "", 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(parsedLimit, defaults.maxLimit))
    : defaults.limit;
  const offset = Number.isFinite(parsedOffset)
    ? Math.max(0, parsedOffset)
    : defaults.offset;
  return { limit, offset };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Session setup
  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  const SESSION_PRUNE_INTERVAL_S = 15 * 60;        // prune expired sessions every 15 min

  // In production use a PostgreSQL-backed session store so sessions survive
  // across multiple Cloud Run instances.  In development fall back to the
  // in-memory store to avoid requiring a database connection.
  const sessionStore =
    process.env.NODE_ENV === "production" && process.env.DATABASE_URL
      ? new PgSessionStore({
          pool,
          tableName: "user_sessions",
          // Auto-create the session table on first connect
          createTableIfMissing: true,
          ttl: SESSION_TTL_MS / 1000, // pg store uses seconds
          pruneSessionInterval: SESSION_PRUNE_INTERVAL_S,
        })
      : new MemoryStore({ checkPeriod: SESSION_TTL_MS });

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "unshelvd-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        maxAge: SESSION_TTL_MS,
        // For Capacitor native apps making cross-origin requests:
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
      },
      // Trust the first proxy (Cloud Run, nginx, etc.)
      proxy: process.env.NODE_ENV === "production",
    }),
  );

  // Passport setup
  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          return done(null, user as any);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      // Don't send password to client
      const { password, ...safeUser } = user;
      done(null, safeUser as any);
    } catch (err) {
      done(err);
    }
  });

  app.use(passport.initialize());
  app.use(passport.session());

  // Maintenance mode — return 503 for all API routes except the health check.
  // Admins can toggle this via the admin settings panel.
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/") || req.path === "/api/health") return next();
    try {
      if (await isEnabled("maintenance_mode", false)) {
        return res
          .status(503)
          .json({ message: "The site is temporarily down for maintenance. Please check back soon." });
      }
    } catch {
      // If the DB is unreachable we can't read settings — don't block requests.
    }
    return next();
  });

  // === HEALTH CHECK ===
  app.get("/api/health", async (_req, res) => {
    let client;
    try {
      client = await pool.connect();
      // BEGIN + SET LOCAL keeps the timeout scoped to this connection's transaction
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = 3000");
      await client.query("SELECT 1");
      await client.query("COMMIT");
      res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
    } catch (err: any) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
      }
      res
        .status(503)
        .json({ status: "degraded", db: "error", error: err.message, timestamp: new Date().toISOString() });
    } finally {
      client?.release();
    }
  });

  // === AUTH ROUTES ===
  app.post("/api/auth/register", async (req, res) => {
    try {
      if (!(await isEnabled("registrations_enabled", true))) {
        return res.status(403).json({ message: "Registrations are currently disabled" });
      }

      const data = insertUserSchema.parse(req.body);

      // Full password policy validation with name context
      const pwResult = validatePassword(data.password, {
        username: data.username,
        displayName: data.displayName,
      });
      if (!pwResult.valid) {
        return res.status(400).json({ message: pwResult.errors[0] });
      }

      // Check uniqueness
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      // Hash with bcrypt (12 rounds)
      const hashedPassword = await bcrypt.hash(data.password, 12);

      const user = await storage.createUser({
        ...data,
        password: hashedPassword,
      });

      // Generate email verification token and mark as unverified (update after create
      // so we don't need to extend InsertUser schema)
      const emailVerifyToken = crypto.randomBytes(32).toString("hex");
      const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h
      await db.update(users)
        .set({ emailVerified: false, emailVerifyToken, emailVerifyExpiry })
        .where(eq(users.id, user.id));

      // Send verification email (fire-and-forget — never blocks registration)
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const verifyUrl = `${origin}/api/auth/verify-email?token=${emailVerifyToken}`;
      sendEmailVerification(user.email, user.displayName, verifyUrl).catch((err) =>
        console.error("[email] verification email failed:", err),
      );

      // Auto-login after registration so the user can start browsing immediately
      const { password, emailVerifyToken: _evToken, emailVerifyExpiry: _evExp, ...safeUser } = user;
      req.login(safeUser as any, (err) => {
        if (err)
          return res
            .status(500)
            .json({ message: "Login failed after registration" });
        return res.json({ ...safeUser, emailVerified: false });
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  // === EMAIL VERIFICATION ===

  // Verify email via token link (linked from the verification email)
  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query as { token?: string };
      if (!token || typeof token !== "string") {
        return res.status(400).send("Invalid verification link.");
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.emailVerifyToken, token));

      if (!user) {
        return res.status(400).send("Verification link is invalid or already used.");
      }
      if (user.emailVerifyExpiry && user.emailVerifyExpiry < new Date()) {
        return res.status(400).send("Verification link has expired. Please request a new one.");
      }

      await db
        .update(users)
        .set({ emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null })
        .where(eq(users.id, user.id));

      // Send welcome email now that the address is confirmed (fire-and-forget)
      sendWelcome(user.email, user.displayName).catch((err) =>
        console.error("[email] welcome email failed:", err),
      );

      // Redirect to the app with a success indicator
      return res.redirect("/#/?email_verified=1");
    } catch (err) {
      return res.status(500).send("Verification failed. Please try again.");
    }
  });

  // Resend verification email (for logged-in users whose email is still unverified)
  app.post("/api/auth/resend-verification", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.emailVerified) {
        return res.status(400).json({ message: "Email is already verified" });
      }

      const emailVerifyToken = crypto.randomBytes(32).toString("hex");
      const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .update(users)
        .set({ emailVerifyToken, emailVerifyExpiry })
        .where(eq(users.id, user.id));

      const origin = req.headers.origin || `https://${req.headers.host}`;
      const verifyUrl = `${origin}/api/auth/verify-email?token=${emailVerifyToken}`;
      sendEmailVerification(user.email, user.displayName, verifyUrl).catch((err) =>
        console.error("[email] resend-verification failed:", err),
      );

      return res.json({ message: "Verification email sent" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to resend verification email" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user)
        return res
          .status(401)
          .json({ message: info?.message || "Invalid credentials" });

      req.login(user, (err) => {
        if (err) return next(err);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      return res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    // Strip sensitive token fields before sending to the client
    const { emailVerifyToken, emailVerifyExpiry, ...safeUser } = req.user;
    return res.json(safeUser);
  });

  // === BOOKS ROUTES ===
  app.get("/api/books", async (req, res) => {
    try {
      const rawLimit = parseInt(req.query.limit as string);
      const rawOffset = parseInt(req.query.offset as string);
      const rawMinPrice = parseFloat(req.query.minPrice as string);
      const rawMaxPrice = parseFloat(req.query.maxPrice as string);
      const filters = {
        search: req.query.search as string | undefined,
        genre: req.query.genre as string | undefined,
        condition: req.query.condition as string | undefined,
        // Only allow publicly-browsable statuses on this unauthenticated endpoint.
        // Private shelves (wishlist, reading, not-for-sale, etc.) must not be
        // returned to anonymous callers.
        status: ["for-sale", "open-to-offers"].includes(req.query.status as string)
          ? (req.query.status as string)
          : undefined,
        minPrice:
          Number.isFinite(rawMinPrice) && rawMinPrice >= 0
            ? rawMinPrice
            : undefined,
        maxPrice:
          Number.isFinite(rawMaxPrice) && rawMaxPrice >= 0
            ? rawMaxPrice
            : undefined,
        language: req.query.language as string | undefined,
        countryOfOrigin: req.query.countryOfOrigin as string | undefined,
        era: req.query.era as string | undefined,
        script: req.query.script as string | undefined,
        sort: req.query.sort as string | undefined,
        limit: Number.isFinite(rawLimit)
          ? Math.min(Math.max(rawLimit, 1), 100)
          : undefined,
        offset: Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : undefined,
      };
      const booksList = await storage.getBooks(filters);
      return res.json(booksList);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  app.get("/api/books/user/:userId", async (req, res) => {
    try {
      const userId = parseIntParam(req.params.userId);
      if (!userId) return res.status(400).json({ message: "Invalid user ID" });
      const rawLimit = parseInt(req.query.limit as string);
      const rawOffset = parseInt(req.query.offset as string);
      const limit = Math.min(!Number.isNaN(rawLimit) && rawLimit > 0 ? rawLimit : 200, 200);
      const offset = !Number.isNaN(rawOffset) && rawOffset > 0 ? rawOffset : 0;
      const booksList = await storage.getBooksByUser(userId, limit, offset);
      return res.json(booksList);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch user books" });
    }
  });

  app.get("/api/books/:id", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid book ID" });
      const book = await storage.getBook(id);
      if (!book) return res.status(404).json({ message: "Book not found" });

      // Enrich with seller info
      const seller = await storage.getUser(book.userId);
      const sellerInfo = seller
        ? {
            id: seller.id,
            username: seller.username,
            displayName: seller.displayName,
            avatarUrl: seller.avatarUrl,
            rating: seller.rating,
            totalSales: seller.totalSales,
            location: seller.location,
          }
        : null;

      return res.json({ ...book, seller: sellerInfo });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch book" });
    }
  });

  app.post("/api/books", requireAuth, async (req, res) => {
    try {
      const data = insertBookSchema.parse(req.body);

      // Auto-resolve to work (runs in background, doesn't block)
      let workId: number | null = null;
      try {
        const resolved = await resolveWork({
          title: data.title,
          author: data.author,
          isbn: data.isbn || undefined,
          language: data.language || undefined,
          originalLanguage: data.originalLanguage || undefined,
          year: data.year || undefined,
          coverUrl: data.coverUrl || undefined,
          genre: data.genre || undefined,
        });
        workId = resolved.workId;
        // Update stats in background
        updateWorkStats(resolved.workId).catch(() => {});
      } catch {
        // Non-fatal: book still gets created even if work resolution fails
      }

      const book = await storage.createBook(req.user!.id, { ...data, workId });

      // Check for matching open requests (case-insensitive title/author match)
      let matchedRequests: { id: number; title: string; userId: number }[] = [];
      try {
        const { requests: openRequests } = await storage.getBookRequests({ status: "open", limit: 100 });
        const titleLower = data.title.toLowerCase();
        const authorLower = data.author.toLowerCase();
        matchedRequests = openRequests
          .filter((r) => {
            const reqTitle = r.title.toLowerCase();
            const reqAuthor = r.author?.toLowerCase() || "";
            return reqTitle.includes(titleLower) || titleLower.includes(reqTitle) ||
              (reqAuthor && (reqAuthor.includes(authorLower) || authorLower.includes(reqAuthor)));
          })
          .map((r) => ({ id: r.id, title: r.title, userId: r.userId }));

        // Notify matched request owners (fire-and-forget, deduplicated by userId)
        const notifiedUsers = new Set<number>();
        for (const match of matchedRequests) {
          if (notifiedUsers.has(match.userId) || match.userId === req.user!.id) continue;
          notifiedUsers.add(match.userId);
          storage.getUser(match.userId).then((requester) => {
            if (!requester) return;
            sendMatchedListing(requester.email, requester.displayName, data.title, book.id).catch(
              (err) => console.error("[email] matched-listing notification failed:", err),
            );
          }).catch(() => {});
        }
      } catch {
        // Non-fatal
      }

      return res.json({ ...book, matchedRequests });
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to create book" });
    }
  });

  app.patch("/api/books/:id", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid book ID" });
      // Validate update data with partial book schema
      const data = insertBookSchema.partial().parse(req.body);

      // Prevent the seller from re-listing a book that has an active (in-flight) payment.
      if (data.status && ["for-sale", "open-to-offers"].includes(data.status)) {
        const [activeTx] = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.bookId, id),
              or(
                eq(transactions.status, "pending"),
                eq(transactions.status, "paid"),
                eq(transactions.status, "shipped"),
              ),
            ),
          )
          .limit(1);
        if (activeTx) {
          return res.status(409).json({
            message: "Cannot re-list a book that has an active transaction",
          });
        }
      }

      const book = await storage.updateBook(id, req.user!.id, data);
      if (!book)
        return res.status(404).json({ message: "Book not found or not yours" });
      return res.json(book);
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to update book" });
    }
  });

  app.delete("/api/books/:id", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid book ID" });
      const deleted = await storage.deleteBook(id, req.user!.id);
      if (!deleted)
        return res.status(404).json({ message: "Book not found or not yours" });
      return res.json({ message: "Book deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete book" });
    }
  });

  // === CATALOG ROUTES ===
  app.get("/api/catalog", async (req, res) => {
    try {
      const {
        q,
        limit: limitStr,
        offset: offsetStr,
        page: pageStr,
        lang,
        country,
      } = req.query as { [key: string]: string };
      const { limit: baseLimit } = parsePagination(limitStr, undefined, {
        limit: 24,
        maxLimit: 100,
        offset: 0,
      });
      // Support both offset and page-based pagination
      const parsedPage = Number.parseInt(pageStr ?? "", 10);
      const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
      const pageOffset = (page - 1) * baseLimit;
      const { limit, offset } = parsePagination(limitStr, offsetStr, {
        limit: 24,
        maxLimit: 100,
        offset: pageOffset,
      });

      const conditions = [];
      if (q && q.length >= 2) {
        const term = `%${sanitizeLikeInput(q)}%`;
        conditions.push(
          or(
            ilike(bookCatalog.title, term),
            ilike(bookCatalog.titleNative, term),
            ilike(bookCatalog.author, term),
            ilike(bookCatalog.authorNative, term),
            eq(bookCatalog.isbn13, q.replace(/[^0-9X]/gi, "")),
          ),
        );
      }
      if (lang)
        conditions.push(
          ilike(bookCatalog.language, `%${sanitizeLikeInput(lang)}%`),
        );
      if (country)
        conditions.push(
          ilike(bookCatalog.countryOfOrigin, `%${sanitizeLikeInput(country)}%`),
        );

      let query = db.select().from(bookCatalog);
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      query = query
        .orderBy(desc(bookCatalog.id))
        .limit(limit)
        .offset(offset) as any;

      const results = await query;

      // Also get total count for pagination
      let countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookCatalog);
      if (conditions.length > 0)
        countQuery = countQuery.where(and(...conditions)) as any;
      const [{ count: total }] = await countQuery;

      return res.json({ books: results, total });
    } catch (err) {
      console.error("Catalog search error:", err);
      return res.status(500).json({ message: "Catalog search failed" });
    }
  });

  // === BOOK REQUESTS ROUTES ===
  app.get("/api/requests", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const { requests, total } = await storage.getBookRequests(
        { status, limit, offset },
      );

      // Enrich with user info
      const enriched = await Promise.all(
        requests.map(async (r) => {
          const user = await storage.getUser(r.userId);
          return {
            ...r,
            user: user
              ? {
                  id: user.id,
                  username: user.username,
                  displayName: user.displayName,
                  avatarUrl: user.avatarUrl,
                }
              : null,
          };
        }),
      );

      return res.json({ requests: enriched, total });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch requests" });
    }
  });

  app.post("/api/requests", requireAuth, async (req, res) => {
    try {
      const data = insertBookRequestSchema.parse(req.body);
      const request = await storage.createBookRequest(req.user!.id, data);
      return res.json(request);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to create request" });
    }
  });

  app.patch("/api/requests/:id", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid request ID" });
      const data = insertBookRequestSchema.partial().parse(req.body);
      const updated = await storage.updateBookRequest(id, req.user!.id, data);
      if (!updated)
        return res
          .status(404)
          .json({ message: "Request not found or not yours" });
      return res.json(updated);
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to update request" });
    }
  });

  app.delete("/api/requests/:id", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid request ID" });
      const deleted = await storage.deleteBookRequest(id, req.user!.id);
      if (!deleted)
        return res
          .status(404)
          .json({ message: "Request not found or not yours" });
      return res.json({ message: "Request deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete request" });
    }
  });

  // === BOOK SEARCH (Open Library) ===
  app.get("/api/search/books", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json([]);
      }

      const fields =
        "title,author_name,first_publish_year,publisher,isbn,cover_i,subject,edition_count";
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=${fields}`;
      const response = await fetch(url);
      const data = (await response.json()) as any;

      const results = (data.docs || []).map((doc: any) => ({
        title: doc.title || "",
        author: doc.author_name?.[0] || "",
        year: doc.first_publish_year || null,
        publisher: doc.publisher?.[0] || null,
        isbn: doc.isbn?.[0] || null,
        coverUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
          : null,
        editionCount: doc.edition_count || 0,
        subjects: (doc.subject || []).slice(0, 5),
      }));

      return res.json(results);
    } catch (err) {
      console.error("Open Library search error:", err);
      return res.status(500).json({ message: "Search failed" });
    }
  });

  // ISBN lookup
  app.get("/api/search/isbn/:isbn", async (req, res) => {
    try {
      const isbn = req.params.isbn.replace(/[^0-9X]/gi, "");
      if (!isbn) {
        return res.status(400).json({ message: "Invalid ISBN" });
      }
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
      const response = await fetch(url);
      const data = (await response.json()) as any;

      const key = `ISBN:${isbn}`;
      if (!data[key]) {
        return res.status(404).json({ message: "Book not found" });
      }

      const book = data[key];
      return res.json({
        title: book.title || "",
        author: book.authors?.[0]?.name || "",
        year: book.publish_date ? parseInt(book.publish_date) || null : null,
        publisher: book.publishers?.[0]?.name || null,
        isbn: isbn,
        coverUrl: book.cover?.large || book.cover?.medium || null,
        subjects: (book.subjects || []).slice(0, 5).map((s: any) => s.name),
        pages: book.number_of_pages || null,
      });
    } catch (err) {
      console.error("ISBN lookup error:", err);
      return res.status(500).json({ message: "ISBN lookup failed" });
    }
  });

  // === BOOK CATALOG (proprietary master database) ===
  app.get("/api/catalog/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      const lang = req.query.language as string;
      const country = req.query.countryOfOrigin as string;
      const { limit, offset } = parsePagination(
        req.query.limit as string | undefined,
        req.query.offset as string | undefined,
      );

      const conditions = [];
      if (q && q.length >= 2) {
        const term = `%${sanitizeLikeInput(q)}%`;
        conditions.push(
          or(
            ilike(bookCatalog.title, term),
            ilike(bookCatalog.titleNative, term),
            ilike(bookCatalog.author, term),
            ilike(bookCatalog.authorNative, term),
            eq(bookCatalog.isbn13, q.replace(/[^0-9X]/gi, "")),
          ),
        );
      }
      if (lang)
        conditions.push(
          ilike(bookCatalog.language, `%${sanitizeLikeInput(lang)}%`),
        );
      if (country)
        conditions.push(
          ilike(bookCatalog.countryOfOrigin, `%${sanitizeLikeInput(country)}%`),
        );

      let query = db.select().from(bookCatalog);
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      query = query
        .orderBy(desc(bookCatalog.id))
        .limit(limit)
        .offset(offset) as any;

      const results = await query;

      // Count total for pagination
      let countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookCatalog);
      if (conditions.length > 0)
        countQuery = countQuery.where(and(...conditions)) as any;
      const [{ count: total }] = await countQuery;

      return res.json({ results, total, limit, offset });
    } catch (err) {
      console.error("Catalog search error:", err);
      return res.status(500).json({ message: "Catalog search failed" });
    }
  });

  app.get("/api/catalog/stats", async (_req, res) => {
    try {
      const [{ count: total }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookCatalog);
      const [{ count: verified }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(bookCatalog)
        .where(eq(bookCatalog.verified, true));

      // Language distribution
      const langDist = await db
        .select({
          language: bookCatalog.language,
          count: sql<number>`count(*)::int`,
        })
        .from(bookCatalog)
        .groupBy(bookCatalog.language)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

      return res.json({ total, verified, languageDistribution: langDist });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch catalog stats" });
    }
  });

  app.get("/api/catalog/:id", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid catalog ID" });
      const rows = await db
        .select()
        .from(bookCatalog)
        .where(eq(bookCatalog.id, id));
      if (!rows[0]) return res.status(404).json({ message: "Not found" });

      // Also fetch user listings linked to this catalog entry
      const listings = await db
        .select()
        .from(books)
        .where(
          and(
            eq(books.catalogId, id),
            or(
              eq(books.status, "for-sale"),
              eq(books.status, "open-to-offers"),
            ),
          ),
        );

      return res.json({ ...rows[0], listings });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch catalog entry" });
    }
  });

  // === GENRES ===

  // Get distinct genres from works and books (splits comma-separated values)
  app.get("/api/genres", async (_req, res) => {
    try {
      // Pull raw comma-separated genre strings from works and books tables
      const workGenres = await db
        .select({ genre: works.genre })
        .from(works)
        .where(sql`${works.genre} IS NOT NULL AND ${works.genre} != ''`);
      const bookGenres = await db
        .select({ genre: books.genre })
        .from(books)
        .where(sql`${books.genre} IS NOT NULL AND ${books.genre} != ''`);

      // Split, trim, deduplicate, and sort
      const allRaw = [...workGenres, ...bookGenres].map((r) => r.genre!);
      const unique = Array.from(
        new Set(
          allRaw.flatMap((g) => g.split(",").map((s) => s.trim()).filter(Boolean)),
        ),
      ).sort((a, b) => a.localeCompare(b));

      return res.json(unique);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch genres" });
    }
  });

  // === WORKS (edition graph) ===

  // Get a work with all its editions grouped by language
  app.get("/api/works/:id", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid work ID" });
      const [work] = await db.select().from(works).where(eq(works.id, id));
      if (!work) return res.status(404).json({ message: "Work not found" });

      const editions = await getWorkEditions(id);

      return res.json({ work, ...editions });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch work" });
    }
  });

  // Search works
  app.get("/api/works", async (req, res) => {
    try {
      const q = req.query.q as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      let query = db.select().from(works);

      if (q && q.length >= 2) {
        const term = `%${sanitizeLikeInput(q)}%`;
        query = query.where(
          or(
            ilike(works.title, term),
            ilike(works.titleOriginal, term),
            ilike(works.titleOriginalScript, term),
            ilike(works.author, term),
            ilike(works.authorOriginal, term),
          ),
        ) as any;
      }

      const results = await query
        .orderBy(desc(works.listingCount), desc(works.editionCount))
        .limit(limit)
        .offset(offset);

      return res.json(results);
    } catch (err) {
      return res.status(500).json({ message: "Work search failed" });
    }
  });

  // Resolve: given title+author+isbn, find or create the work
  app.post("/api/works/resolve", requireAuth, async (req, res) => {
    try {
      const resolveSchema = z.object({
        title: z.string().min(1).max(500),
        author: z.string().min(1).max(200),
        isbn: z.string().max(20).nullable().optional(),
        language: z.string().max(50).nullable().optional(),
        originalLanguage: z.string().max(50).nullable().optional(),
        year: z.number().nullable().optional(),
        coverUrl: z.string().url().nullable().optional(),
        genre: z.string().max(200).nullable().optional(),
      });
      const {
        title,
        author,
        isbn,
        language,
        originalLanguage,
        year,
        coverUrl,
        genre,
      } = resolveSchema.parse(req.body);

      const result = await resolveWork({
        title,
        author,
        isbn,
        language,
        originalLanguage,
        year,
        coverUrl,
        genre,
      });

      // Fetch the work
      const [work] = await db
        .select()
        .from(works)
        .where(eq(works.id, result.workId));

      return res.json({ ...result, work });
    } catch (err) {
      console.error("Work resolve error:", err);
      return res.status(500).json({ message: "Failed to resolve work" });
    }
  });

  // Get all editions for a work as flat list
  app.get("/api/works/:id/editions", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid work ID" });
      const editions = await getWorkEditions(id);
      return res.json(editions);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch editions" });
    }
  });

  // Get user listings for a work
  app.get("/api/works/:id/listings", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid work ID" });
      const listings = await db
        .select()
        .from(books)
        .where(
          and(
            eq(books.workId, id),
            or(
              eq(books.status, "for-sale"),
              eq(books.status, "open-to-offers"),
            ),
          ),
        )
        .orderBy(asc(books.price));

      return res.json(listings);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch listings" });
    }
  });

  // === SELLER STRIPE ONBOARDING ===

  // Start or resume Stripe Connect onboarding
  app.post("/api/seller/connect", requireAuth, async (req, res) => {
    try {
      const serverOrigin = `${req.protocol}://${req.get("host")}`;
      const defaultUrl = `${serverOrigin}/#/dashboard`;

      let returnUrl = defaultUrl;
      if (req.body.returnUrl) {
        // Only allow same-origin return URLs (prevent open redirect)
        try {
          const parsed = new URL(req.body.returnUrl, serverOrigin);
          const allowed = new URL(serverOrigin);
          if (parsed.origin === allowed.origin) {
            returnUrl = parsed.href;
          }
        } catch {
          // malformed URL — use default
        }
      }

      const result = await createSellerAccount(req.user!.id, returnUrl);
      return res.json(result);
    } catch (err: any) {
      return res
        .status(400)
        .json({ message: err.message || "Failed to create seller account" });
    }
  });

  // Check seller's Stripe status
  app.get("/api/seller/status", requireAuth, async (req, res) => {
    try {
      const result = await checkSellerStatus(req.user!.id);
      return res.json(result);
    } catch (err: any) {
      return res
        .status(400)
        .json({ message: err.message || "Failed to check status" });
    }
  });

  // Stripe Connect OAuth return handler
  app.get("/api/seller/connect/complete", requireAuth, async (req, res) => {
    try {
      // After Stripe redirects back, check the account status
      const result = await checkSellerStatus(req.user!.id);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  // === PAYMENTS ===

  // Public runtime config for the frontend.
  // Only returns non-secret public values (Stripe PK, PayPal client ID, enabled flags).
  // DB settings take priority over build-time env vars.
  app.get("/api/config/public", async (_req, res) => {
    const stripePk =
      (await getSetting("stripe_publishable_key")) ||
      process.env.STRIPE_PUBLISHABLE_KEY ||
      process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      null;
    const paypalClientId =
      (await getSetting("paypal_client_id")) || process.env.PAYPAL_CLIENT_ID || null;
    const paypalEnabled = await isEnabled("paypal_enabled", false);
    const stripeEnabled = await isStripeEnabled();
    return res.json({ stripePk, paypalClientId, paypalEnabled, stripeEnabled });
  });

  // Get fee info
  app.get("/api/payments/fee-info", async (_req, res) => {
    const feePercent =
      parseFloat((await getSetting("platform_fee_percent")) || "") || PLATFORM_FEE_PERCENT * 100;
    return res.json({
      platformFeePercent: feePercent,
      description: `Unshelv'd charges a ${feePercent}% platform fee on each sale.`,
    });
  });

  // Create checkout / payment intent
  app.post("/api/payments/checkout", requireAuth, async (req, res) => {
    try {
      const checkoutSchema = z.object({
        bookId: z.number().int().positive(),
        offerId: z.number().int().positive().optional(),
      });
      const { bookId, offerId } = checkoutSchema.parse(req.body);

      const result = await createPaymentIntent(req.user!.id, bookId, offerId);
      return res.json(result);
    } catch (err: any) {
      return res
        .status(400)
        .json({ message: err.message || "Checkout failed" });
    }
  });

  // Confirm payment (after Stripe succeeds, or dev mode)
  app.post("/api/payments/:id/confirm", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id)
        return res.status(400).json({ message: "Invalid transaction ID" });
      const result = await confirmPayment(id, req.user!.id);

      // Notify seller that payment was received (fire-and-forget)
      if (result.status === "paid") {
        const buyerName = req.user!.displayName || req.user!.username;
        db.select({ sellerId: transactions.sellerId, bookId: transactions.bookId, amount: transactions.amount })
          .from(transactions)
          .where(eq(transactions.id, id))
          .then(([tx]) => {
            if (!tx) return;
            Promise.all([
              storage.getUser(tx.sellerId),
              storage.getBook(tx.bookId),
            ]).then(([seller, book]) => {
              if (!seller || !book) return;
              sendPaymentReceived(seller.email, buyerName, book.title, tx.amount).catch(
                (err) => console.error("[email] payment-received notification failed:", err),
              );
            }).catch(() => {});
          }).catch(() => {});
      }

      return res.json(result);
    } catch (err: any) {
      return res
        .status(400)
        .json({ message: err.message || "Confirmation failed" });
    }
  });

  // Seller marks shipped
  app.post("/api/payments/:id/ship", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id)
        return res.status(400).json({ message: "Invalid transaction ID" });
      const shipSchema = z.object({
        carrier: z.string().max(100).optional(),
        trackingNumber: z.string().max(100).optional(),
      });
      const { carrier, trackingNumber } = shipSchema.parse(req.body);
      const result = await markShipped(
        id,
        req.user!.id,
        carrier,
        trackingNumber,
      );

      // Notify buyer that their book was shipped (fire-and-forget)
      const sellerName = req.user!.displayName || req.user!.username;
      db.select({ buyerId: transactions.buyerId, bookId: transactions.bookId })
        .from(transactions)
        .where(eq(transactions.id, id))
        .then(([tx]) => {
          if (!tx) return;
          Promise.all([
            storage.getUser(tx.buyerId),
            storage.getBook(tx.bookId),
          ]).then(([buyer, book]) => {
            if (!buyer || !book) return;
            sendBookShipped(buyer.email, sellerName, book.title, carrier, trackingNumber).catch(
              (err) => console.error("[email] book-shipped notification failed:", err),
            );
          }).catch(() => {});
        }).catch(() => {});

      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  // Buyer confirms delivery
  app.post("/api/payments/:id/deliver", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id)
        return res.status(400).json({ message: "Invalid transaction ID" });
      const result = await confirmDelivery(id, req.user!.id);

      // Notify seller that delivery was confirmed and payout is on its way (fire-and-forget)
      const buyerName = req.user!.displayName || req.user!.username;
      db.select({ sellerId: transactions.sellerId, bookId: transactions.bookId, sellerPayout: transactions.sellerPayout })
        .from(transactions)
        .where(eq(transactions.id, id))
        .then(([tx]) => {
          if (!tx) return;
          Promise.all([
            storage.getUser(tx.sellerId),
            storage.getBook(tx.bookId),
          ]).then(([seller, book]) => {
            if (!seller || !book) return;
            sendDeliveryConfirmed(seller.email, buyerName, book.title, tx.sellerPayout).catch(
              (err) => console.error("[email] delivery-confirmed notification failed:", err),
            );
          }).catch(() => {});
        }).catch(() => {});

      return res.json(result);
    } catch (err: any) {
      return res
        .status(400)
        .json({ message: err.message || "Confirmation failed" });
    }
  });

  // Get user's transactions
  app.get("/api/payments/transactions", requireAuth, async (req, res) => {
    try {
      const result = await getUserTransactions(req.user!.id);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Stripe webhook (handles payment confirmations)
  app.post("/api/webhooks/stripe", async (req, res) => {
    // DB setting takes priority over env var so admin can rotate the secret without a redeploy
    const webhookSecret =
      (await getSetting("stripe_webhook_secret")) || process.env.STRIPE_WEBHOOK_SECRET || null;
    let event: Record<string, any>;

    if (webhookSecret) {
      // Production: require valid Stripe signature
      const sig = req.headers["stripe-signature"] as string;
      const rawBody = req.rawBody;
      if (!sig || !rawBody) {
        return res.status(400).json({ message: "Missing stripe-signature header or raw body" });
      }
      try {
        const s = await getStripe();
        if (!s) return res.status(500).json({ message: "Stripe not configured" });
        event = s.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err) {
        console.error("[webhook] Signature verification failed:", err);
        return res.status(400).json({ message: "Webhook signature invalid" });
      }
    } else {
      // Dev mode: trust the body as-is (no secret configured)
      event = req.body;
    }

    console.log(`[webhook] ${event.type}`);

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data.object;
          const transactionId = parseInt(pi.metadata?.transactionId);
          const buyerId = parseInt(pi.metadata?.buyerId);
          if (transactionId && buyerId) await confirmPayment(transactionId, buyerId);
          break;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data.object;
          if (pi.id) await failPayment(pi.id);
          break;
        }
        case "account.updated": {
          const account = event.data.object;
          await handleSellerAccountUpdated(
            account.id,
            account.details_submitted ?? false,
            account.charges_enabled ?? false,
          );
          break;
        }
        case "transfer.failed": {
          const transfer = event.data.object;
          if (transfer.id) await handleTransferFailed(transfer.id);
          break;
        }
        case "charge.refunded": {
          const charge = event.data.object;
          if (charge.payment_intent) await handleChargeRefunded(charge.payment_intent as string);
          break;
        }
        default:
          console.log(`[webhook] Unhandled event type: ${event.type}`);
      }
      return res.json({ received: true });
    } catch (err) {
      console.error(`[webhook] Error handling ${event.type}:`, err);
      return res.status(500).json({ message: "Webhook handler error" });
    }
  });

  // PayPal webhook — handles async authorization lifecycle events
  app.post("/api/webhooks/paypal", async (req, res) => {
    const webhookId =
      (await getSetting("paypal_webhook_id")) || process.env.PAYPAL_WEBHOOK_ID || null;

    const event = req.body as Record<string, any>;

    if (webhookId) {
      // Production: verify the PayPal signature
      const transmissionId = req.headers["paypal-transmission-id"] as string;
      const transmissionTime = req.headers["paypal-transmission-time"] as string;
      const certUrl = req.headers["paypal-cert-url"] as string;
      const authAlgo = req.headers["paypal-auth-algo"] as string;
      const transmissionSig = req.headers["paypal-transmission-sig"] as string;

      if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
        return res.status(400).json({ message: "Missing PayPal webhook signature headers" });
      }

      const valid = await verifyPayPalWebhookSignature({
        authAlgo,
        certUrl,
        transmissionId,
        transmissionSig,
        transmissionTime,
        webhookId,
        webhookEvent: event,
      });
      if (!valid) {
        console.error("[paypal-webhook] Signature verification failed");
        return res.status(400).json({ message: "Webhook signature invalid" });
      }
    }

    const eventType: string = event.event_type ?? "";
    console.log(`[paypal-webhook] ${eventType}`);

    try {
      switch (eventType) {
        case "PAYMENT.AUTHORIZATION.VOIDED": {
          // PayPal voided an authorization (e.g. it expired after 29 days without capture).
          // Mark the transaction as cancelled and re-list the book so buyers can purchase again.
          const authId: string | undefined =
            event.resource?.id;
          if (authId) {
            const [tx] = await db
              .select()
              .from(transactions)
              .where(eq(transactions.paypalAuthorizationId, authId))
              .limit(1);
            if (tx && tx.status === "paid") {
              await db
                .update(transactions)
                .set({ status: "cancelled", updatedAt: new Date() })
                .where(eq(transactions.id, tx.id));
              // Re-list the book so it can be purchased again
              if (tx.bookId) {
                await db
                  .update(books)
                  .set({ status: "for-sale" })
                  .where(eq(books.id, tx.bookId));
              }
              console.log(`[paypal-webhook] Cancelled tx ${tx.id} due to voided authorization ${authId}`);
            }
          }
          break;
        }
        default:
          console.log(`[paypal-webhook] Unhandled event type: ${eventType}`);
      }
      return res.json({ received: true });
    } catch (err) {
      console.error(`[paypal-webhook] Error handling ${eventType}:`, err);
      return res.status(500).json({ message: "Webhook handler error" });
    }
  });

  // ── PayPal checkout routes ──────────────────────────────────────────────

  /** Check whether PayPal is enabled for this deployment. Requires auth to avoid leaking config. */
  app.get("/api/payments/paypal/status", requireAuth, async (_req, res) => {
    const enabled = await isPayPalEnabled();
    return res.json({ enabled });
  });

  /** Create a PayPal order for a book purchase. */
  app.post("/api/payments/paypal/create-order", requireAuth, async (req, res) => {
    try {
      const enabled = await isPayPalEnabled();
      if (!enabled) {
        return res.status(503).json({ message: "PayPal payments are not enabled" });
      }

      const { bookId, offerId } = req.body as { bookId?: number; offerId?: number };
      if (!bookId) return res.status(400).json({ message: "bookId is required" });

      // Validate buyer is not the seller before touching any state.
      const [bookCheck] = await db.select().from(books).where(eq(books.id, bookId));
      if (!bookCheck) return res.status(404).json({ message: "Book not found" });
      if (!bookCheck.price) return res.status(400).json({ message: "Book has no price" });
      if (bookCheck.userId === req.user!.id) {
        return res.status(400).json({ message: "You cannot buy your own book" });
      }
      if (bookCheck.status !== "for-sale" && bookCheck.status !== "open-to-offers") {
        return res.status(400).json({ message: "Book is not available for purchase" });
      }

      // Atomically lock the book so a concurrent buyer can't purchase the same copy.
      const [book] = await db
        .update(books)
        .set({ status: "not-for-sale" })
        .where(and(
          eq(books.id, bookId),
          or(eq(books.status, "for-sale"), eq(books.status, "open-to-offers")),
        ))
        .returning();
      if (!book) {
        return res.status(409).json({ message: "Book is no longer available for purchase" });
      }

      const { platformFee, sellerPayout } = await calculateFees(book.price!);

      // Create the pending transaction record before creating the PayPal order so
      // we always have an audit trail, even if the buyer abandons the PayPal flow.
      const [transaction] = await db.insert(transactions).values({
        buyerId: req.user!.id,
        sellerId: book.userId,
        bookId,
        offerId: offerId || null,
        amount: book.price!,
        platformFee,
        sellerPayout,
        status: "pending",
      }).returning();

      const origin = req.headers.origin || `https://${req.headers.host}`;
      let orderId: string;
      let approveUrl: string;
      try {
        ({ orderId, approveUrl } = await createPayPalOrder({
          bookId,
          buyerId: req.user!.id,
          sellerId: book.userId,
          amount: book.price!,
          returnUrl: `${origin}/#/paypal/return?bookId=${bookId}${offerId ? `&offerId=${offerId}` : ""}`,
          cancelUrl: `${origin}/#/paypal/cancel`,
        }));
      } catch (paypalErr) {
        // PayPal API failed — roll back the book lock and transaction so the
        // book doesn't get stuck as "not-for-sale" permanently.
        await db.update(books).set({ status: bookCheck.status }).where(eq(books.id, bookId));
        await db.delete(transactions).where(eq(transactions.id, transaction.id));
        throw paypalErr;
      }

      // Store the PayPal order ID on the transaction for ownership checks at capture time.
      await db.update(transactions)
        .set({ paypalOrderId: orderId })
        .where(eq(transactions.id, transaction.id));

      return res.json({ orderId, approveUrl, transactionId: transaction.id });
    } catch (err: any) {
      console.error("[PayPal create-order]", err);
      return res.status(500).json({ message: err.message || "Failed to create PayPal order" });
    }
  });

  /**
   * Authorize an approved PayPal order (escrow step 1).
   * Called when the buyer returns from PayPal after approving payment.
   * Funds are held on the buyer's account but not yet captured.
   * The actual capture happens when the buyer confirms delivery.
   */
  app.post("/api/payments/paypal/capture-order", requireAuth, async (req, res) => {
    try {
      const enabled = await isPayPalEnabled();
      if (!enabled) {
        return res.status(503).json({ message: "PayPal payments are not enabled" });
      }

      const { orderId } = req.body as { orderId?: string };
      if (!orderId) return res.status(400).json({ message: "orderId is required" });
      if (!/^[A-Z0-9]{1,22}$/.test(orderId)) {
        return res.status(400).json({ message: "Invalid orderId format" });
      }

      // Verify the authenticated user is the buyer for this order.
      const [tx] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.paypalOrderId, orderId))
        .limit(1);
      if (!tx) return res.status(404).json({ message: "Transaction not found for this order" });
      if (tx.buyerId !== req.user!.id) {
        return res.status(403).json({ message: "Not authorised to complete this order" });
      }
      if (tx.status !== "pending") {
        return res.status(409).json({ message: "Order has already been processed or cancelled" });
      }

      // Authorize the order — this holds funds without capturing them (true escrow).
      const { authorizationId, status: authStatus } = await authorizePayPalOrder(orderId);

      if (authStatus === "CREATED" || authStatus === "CAPTURED") {
        await db.update(transactions)
          .set({ status: "paid", paypalAuthorizationId: authorizationId, updatedAt: new Date() })
          .where(eq(transactions.id, tx.id));

        // Notify the seller
        const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
        const [bookRow] = await db.select().from(books).where(eq(books.id, tx.bookId));
        const buyerName = req.user!.displayName || req.user!.username;
        if (seller && bookRow) {
          sendPaymentReceived(seller.email, buyerName, bookRow.title, tx.amount).catch(
            (err) => console.error("[email] payment-received notification failed:", err),
          );
        }
      }

      return res.json({ authorizationId, status: authStatus, transactionId: tx.id });
    } catch (err: any) {
      console.error("[PayPal authorize-order]", err);
      return res.status(500).json({ message: err.message || "Failed to authorize PayPal order" });
    }
  });

  // === USER ROUTES ===
  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const allowedFields = z.object({
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        location: z.string().max(100).optional(),
        // Accept HTTPS URLs or data: URIs (for direct image upload)
        avatarUrl: z.string().optional().or(z.literal("")),
      });
      const data = allowedFields.parse(req.body);
      const updated = await storage.updateUser(req.user!.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password, emailVerifyToken, emailVerifyExpiry, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(1),
      }).parse(req.body);

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(400).json({ message: "Current password is incorrect" });

      const pwResult = validatePassword(newPassword, {});
      if (!pwResult.valid)
        return res.status(400).json({ message: pwResult.errors?.[0] || "Password does not meet requirements" });

      const hashed = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(req.user!.id, { password: hashed });
      return res.json({ message: "Password updated" });
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid user ID" });
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "User not found" });
      // Strip all internal/sensitive fields before returning to any caller.
      // emailVerifyToken + emailVerifyExpiry are security tokens — never expose.
      // email is private personal data — this endpoint is public and returns profile
      // info visible to other users. The authenticated owner can get their own email
      // via GET /api/auth/me.
      const {
        password,
        passwordResetToken,
        passwordResetExpiry,
        emailVerifyToken,
        emailVerifyExpiry,
        email,
        stripeAccountId,
        stripeOnboarded,
        ...safeUser
      } = user;
      return res.json(safeUser);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Rate the seller after a completed transaction
  app.post("/api/transactions/:id/rate", requireAuth, async (req, res) => {
    try {
      const txId = parseIntParam(req.params.id);
      if (!txId) return res.status(400).json({ message: "Invalid transaction ID" });

      const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body);

      // Fetch and validate the transaction
      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (tx.buyerId !== req.user!.id) return res.status(403).json({ message: "Only the buyer can rate this transaction" });
      if (tx.status !== "completed") return res.status(400).json({ message: "Can only rate completed transactions" });

      // Atomic guard: only succeeds when no rating exists yet — eliminates the double-submit TOCTOU race
      const [updated] = await db
        .update(transactions)
        .set({ buyerRating: rating })
        .where(and(eq(transactions.id, txId), isNull(transactions.buyerRating)))
        .returning();
      if (!updated) {
        return res.status(400).json({ message: "You have already rated this transaction" });
      }

      // Atomically recalculate the seller's rating using SQL arithmetic — no read-then-write race
      await db
        .update(users)
        .set({
          ratingCount: sql`COALESCE(${users.ratingCount}, 0) + 1`,
          rating: sql`ROUND(((COALESCE(${users.rating}, 0) * COALESCE(${users.ratingCount}, 0) + ${rating}) / (COALESCE(${users.ratingCount}, 0) + 1))::numeric, 1)`,
        })
        .where(eq(users.id, tx.sellerId));

      return res.json({ message: "Rating submitted", rating });
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  // === PASSWORD RESET ===

  // Step 1 — generate a reset token (in production this would be emailed)
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await storage.getUserByEmail(email);

      // Always return success to avoid user enumeration
      if (!user) return res.json({ message: "If that email is registered, a reset link has been sent." });

      // Generate a cryptographically secure token
      const token = crypto.randomBytes(32).toString("hex");
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.update(users).set({
        passwordResetToken: token,
        passwordResetExpiry: expiry,
      }).where(eq(users.id, user.id));

      const resetUrl = `${req.protocol}://${req.get("host")}/#/reset-password?token=${token}`;

      // Send reset email (fire-and-forget)
      sendPasswordReset(email, resetUrl).catch((err) =>
        console.error("[email] password-reset failed:", err),
      );

      // Return the token in development; strip it in production
      const payload: Record<string, string> = { message: "If that email is registered, a reset link has been sent." };
      if (process.env.NODE_ENV !== "production") {
        payload.resetToken = token;
        payload.resetUrl = resetUrl;
      }
      return res.json(payload);
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to process request" });
    }
  });

  // Step 2 — validate token and set new password
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(12),
      }).parse(req.body);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.passwordResetToken, token));

      if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
        return res.status(400).json({ message: "Reset link is invalid or has expired." });
      }

      // Pass name context so the policy can reject passwords that contain the
      // user's own username or display name (same as during registration).
      const pwResult = validatePassword(password, {
        username: user.username,
        displayName: user.displayName,
      });
      if (!pwResult.valid) {
        return res.status(400).json({ message: pwResult.errors?.[0] || "Password does not meet requirements" });
      }

      const hashed = await bcrypt.hash(password, 12);
      await db.update(users).set({
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiry: null,
      }).where(eq(users.id, user.id));

      return res.json({ message: "Password has been reset. You can now log in." });
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // === MESSAGE ROUTES ===
  app.get("/api/messages", requireAuth, async (req, res) => {
    try {
      const conversations = await storage.getConversations(req.user!.id);
      return res.json(conversations);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/messages/unread/count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadCount(req.user!.id);
      return res.json({ count });
    } catch (err) {
      return res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.get("/api/messages/:userId", requireAuth, async (req, res) => {
    try {
      const otherUserId = parseIntParam(req.params.userId);
      if (!otherUserId)
        return res.status(400).json({ message: "Invalid user ID" });
      const msgs = await storage.getMessages(req.user!.id, otherUserId);
      // Mark as read
      await storage.markMessagesRead(req.user!.id, otherUserId);
      return res.json(msgs);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    try {
      const data = insertMessageSchema.parse(req.body);
      if (data.receiverId === req.user!.id)
        return res.status(400).json({ message: "Cannot send a message to yourself" });
      const receiver = await storage.getUser(data.receiverId);
      if (!receiver) return res.status(404).json({ message: "Recipient not found" });
      const message = await storage.createMessage(req.user!.id, data);

      // Notify recipient (fire-and-forget)
      const senderName = req.user!.displayName || req.user!.username;
      sendNewMessage(receiver.email, senderName, data.content).catch((err) =>
        console.error("[email] new-message notification failed:", err),
      );

      return res.json(message);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to send message" });
    }
  });

  // === OFFERS ROUTES ===
  app.get("/api/offers", requireAuth, async (req, res) => {
    try {
      const offerData = await storage.getOffers(req.user!.id);
      return res.json(offerData);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch offers" });
    }
  });

  app.post("/api/offers", requireAuth, async (req, res) => {
    try {
      const data = insertOfferSchema.parse(req.body);
      // Get the book to find the seller
      const book = await storage.getBook(data.bookId);
      if (!book) return res.status(404).json({ message: "Book not found" });
      if (book.userId === req.user!.id)
        return res
          .status(400)
          .json({ message: "Cannot make offer on your own book" });
      if (book.status !== "open-to-offers" && book.status !== "for-sale") {
        return res
          .status(400)
          .json({ message: "This book is not accepting offers" });
      }

      const offer = await storage.createOffer(req.user!.id, book.userId, data);

      // Notify the seller about the new offer (fire-and-forget)
      const buyerName = req.user!.displayName || req.user!.username;
      storage.getUser(book.userId).then((seller) => {
        if (!seller) return;
        sendNewOffer(seller.email, buyerName, book.title, data.amount).catch(
          (err) => console.error("[email] new-offer notification failed:", err),
        );
      }).catch(() => {});

      return res.json(offer);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to create offer" });
    }
  });

  app.patch("/api/offers/:id", requireAuth, async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid offer ID" });
      const data = updateOfferSchema.parse(req.body);
      const offer = await storage.updateOffer(
        id,
        req.user!.id,
        data.status,
        data.counterAmount,
      );
      if (!offer)
        return res
          .status(404)
          .json({ message: "Offer not found or not yours" });

      // Notify the other party about the status change (fire-and-forget).
      // If the seller responded → notify the buyer; if the buyer responded → notify the seller.
      const notifyUserId = offer.sellerId === req.user!.id ? offer.buyerId : offer.sellerId;
      storage.getUser(notifyUserId).then((recipient) => {
        if (!recipient) return;
        storage.getBook(offer.bookId).then((book) => {
          if (!book) return;
          const status = data.status as "accepted" | "declined" | "countered";
          sendOfferUpdated(recipient.email, status, book.title, data.counterAmount ?? null).catch(
            (err) => console.error("[email] offer-updated notification failed:", err),
          );
        }).catch(() => {});
      }).catch(() => {});

      return res.json(offer);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.issues[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to update offer" });
    }
  });

  // ═══ Admin Routes ═══
  registerAdminRoutes(app);

  // === ORDER CANCELLATION ===
  // Buyer cancels a pending or paid order (before it has shipped).
  // Pending: no payment captured — just mark cancelled and re-list the book.
  // Paid: payment was held — issue a refund (Stripe refund / PayPal authorization void).
  app.post("/api/payments/:id/cancel", requireAuth, async (req, res) => {
    try {
      const txId = parseIntParam(req.params.id);
      if (!txId) return res.status(400).json({ message: "Invalid transaction ID" });

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (tx.buyerId !== req.user!.id) {
        return res.status(403).json({ message: "Only the buyer can cancel an order" });
      }
      if (!["pending", "paid"].includes(tx.status ?? "")) {
        return res.status(400).json({
          message: "Orders can only be cancelled before they have been shipped",
        });
      }

      if (tx.status === "paid") {
        // Refund clears payment, voids PayPal auth, and re-lists book.
        await refundPayment(txId);
      } else {
        // Pending: no money was ever captured — just cancel and re-list.
        await db
          .update(transactions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(transactions.id, txId), eq(transactions.status, "pending")));
        await db.update(books).set({ status: "for-sale" }).where(eq(books.id, tx.bookId));
      }

      // Notify both parties (fire-and-forget)
      const [buyer] = await db.select().from(users).where(eq(users.id, tx.buyerId));
      const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
      const [bookRow] = await db.select().from(books).where(eq(books.id, tx.bookId));
      if (bookRow) {
        if (buyer) {
          sendOrderCancelled(buyer.email, "buyer", bookRow.title).catch((err) =>
            console.error("[email] cancel order buyer notification failed:", err),
          );
        }
        if (seller) {
          sendOrderCancelled(seller.email, "seller", bookRow.title).catch((err) =>
            console.error("[email] cancel order seller notification failed:", err),
          );
        }
      }

      return res.json({ message: "Order cancelled successfully." });
    } catch (err: any) {
      console.error("[cancel order]", err);
      return res.status(500).json({ message: err.message || "Failed to cancel order" });
    }
  });

  // === DISPUTE ROUTE ===
  // Buyer opens a dispute for a transaction that's in "paid" or "shipped" state
  app.post("/api/payments/:id/dispute", requireAuth, async (req, res) => {
    try {
      const txId = parseIntParam(req.params.id);
      if (!txId) return res.status(400).json({ message: "Invalid transaction ID" });

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (tx.buyerId !== req.user!.id) return res.status(403).json({ message: "Only the buyer can open a dispute" });
      if (!["paid", "shipped"].includes(tx.status ?? "")) {
        return res.status(400).json({ message: "Disputes can only be opened for paid or shipped orders" });
      }

      const [updatedTx] = await db
        .update(transactions)
        .set({ status: "disputed", updatedAt: new Date() })
        .where(and(
          eq(transactions.id, txId),
          or(eq(transactions.status, "paid"), eq(transactions.status, "shipped")),
        ))
        .returning();

      if (!updatedTx) {
        return res.status(409).json({ message: "Transaction is no longer in a disputable state" });
      }

      // Notify the seller so they're aware a dispute is in progress (fire-and-forget)
      const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
      const [bookRow] = await db.select().from(books).where(eq(books.id, tx.bookId));
      const buyerName = req.user!.displayName || req.user!.username;
      if (seller && bookRow) {
        sendDisputeOpened(seller.email, buyerName, bookRow.title).catch((err) =>
          console.error("[email] dispute-opened notification failed:", err),
        );
      }

      return res.json({ message: "Dispute opened. Our team will review this transaction." });
    } catch (err) {
      return res.status(500).json({ message: "Failed to open dispute" });
    }
  });

  // === ACCOUNT DELETION ===
  // Soft-delete: anonymize personal data while preserving transaction history
  app.delete("/api/users/me", requireAuth, async (req, res) => {
    try {
      const { password } = z.object({ password: z.string().min(1) }).parse(req.body);

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Verify password before deleting
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ message: "Incorrect password" });

      // Block deletion if user has active (non-terminal) transactions.
      // Terminal statuses: completed, refunded, failed, cancelled.
      // Disputed transactions are actively under review — block deletion until resolved.
      const [activeTx] = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(
            or(eq(transactions.buyerId, user.id), eq(transactions.sellerId, user.id)),
            sql`${transactions.status} NOT IN ('completed', 'refunded', 'failed', 'cancelled')`,
          ),
        )
        .limit(1);
      if (activeTx) {
        return res.status(400).json({
          message: "Cannot delete account while you have active transactions. Please complete or cancel all orders first.",
        });
      }

      // Anonymise: remove all personal data, mark as deleted
      const deletedEmail = `deleted_${user.id}@deleted.invalid`;
      const deletedUsername = `deleted_${user.id}`;
      await db.update(users).set({
        username: deletedUsername,
        displayName: "Deleted User",
        email: deletedEmail,
        password: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
        bio: null,
        avatarUrl: null,
        location: null,
        role: "deleted",
        stripeAccountId: null,
        passwordResetToken: null,
        passwordResetExpiry: null,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      }).where(eq(users.id, user.id));

      // Log out
      req.logout((err) => {
        if (err) console.error("[account-delete] logout error:", err);
      });

      return res.json({ message: "Account deleted. We're sorry to see you go." });
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // === SELLER RATES BUYER ===
  app.post("/api/transactions/:id/rate-buyer", requireAuth, async (req, res) => {
    try {
      const txId = parseIntParam(req.params.id);
      if (!txId) return res.status(400).json({ message: "Invalid transaction ID" });

      const { rating } = z.object({ rating: z.number().int().min(1).max(5) }).parse(req.body);

      const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
      if (!tx) return res.status(404).json({ message: "Transaction not found" });
      if (tx.sellerId !== req.user!.id) return res.status(403).json({ message: "Only the seller can rate the buyer" });
      if (tx.status !== "completed") return res.status(400).json({ message: "Can only rate completed transactions" });

      // Atomic guard: only succeeds when no seller rating exists yet
      const [updated] = await db
        .update(transactions)
        .set({ sellerRating: rating })
        .where(and(eq(transactions.id, txId), isNull(transactions.sellerRating)))
        .returning();
      if (!updated) {
        return res.status(400).json({ message: "You have already rated this buyer" });
      }

      // Update buyer's aggregate rating
      await db
        .update(users)
        .set({
          buyerRatingCount: sql`COALESCE(${users.buyerRatingCount}, 0) + 1`,
          buyerRating: sql`ROUND(((COALESCE(${users.buyerRating}, 0) * COALESCE(${users.buyerRatingCount}, 0) + ${rating}) / (COALESCE(${users.buyerRatingCount}, 0) + 1))::numeric, 1)`,
        })
        .where(eq(users.id, tx.buyerId));

      return res.json({ message: "Rating submitted", rating });
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  // === IMAGE UPLOAD ===
  // Accepts a base64-encoded data URL from the client (FileReader.readAsDataURL).
  // Returns the same data URL so callers can use it consistently.
  // Max size: 1 MB encoded (≈ 750 KB raw image).
  app.post("/api/upload/image", requireAuth, async (req, res) => {
    try {
      const { data: dataUrl, type } = z.object({
        data: z.string().min(1),
        type: z.enum(["avatar", "cover"]),
      }).parse(req.body);

      // Validate it's actually a data URI with an image MIME type
      if (!/^data:image\/(jpeg|jpg|png|webp|gif);base64,/.test(dataUrl)) {
        return res.status(400).json({ message: "Only JPEG, PNG, WebP, or GIF images are supported" });
      }

      const maxBytes = type === "avatar" ? 1_048_576 : 2_097_152; // 1 MB avatar, 2 MB cover
      const base64Part = dataUrl.split(",")[1] ?? "";
      const byteSize = Math.ceil((base64Part.length * 3) / 4);
      if (byteSize > maxBytes) {
        const limitMB = maxBytes / 1_048_576;
        return res.status(400).json({ message: `Image too large. Maximum size is ${limitMB} MB.` });
      }

      return res.json({ url: dataUrl });
    } catch (err) {
      if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message });
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  return httpServer;
}
