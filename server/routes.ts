import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage, pool } from "./storage";
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
} from "@shared/schema";
import { db } from "./storage";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
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
  getUserTransactions,
  PLATFORM_FEE_PERCENT,
  createSellerAccount,
  checkSellerStatus,
} from "./payments";
import { registerAdminRoutes } from "./admin";
import { validatePassword } from "@shared/password-policy";
import { sanitizeLikeInput, parseIntParam } from "./security";
import { z } from "zod";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import createMemoryStore from "memorystore";
import bcrypt from "bcryptjs";

const PgSessionStore = connectPgSimple(session);
const MemoryStore = createMemoryStore(session);
import { ZodError } from "zod";

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
      createdAt: string | null;
    }
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Session setup
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

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
          ttl: sessionTtl / 1000, // pg store uses seconds
          pruneSessionInterval: 60 * 15, // prune expired sessions every 15 min
        })
      : new MemoryStore({ checkPeriod: sessionTtl });

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "unshelvd-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        maxAge: sessionTtl,
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

  // === HEALTH CHECK ===
  app.get("/api/health", async (_req, res) => {
    try {
      // Use two separate queries so the timeout applies only to the
      // session-level config, not as part of a multi-statement string.
      await pool.query("SET LOCAL statement_timeout = 3000");
      await pool.query("SELECT 1");
      res.json({ status: "ok", db: "ok", timestamp: new Date().toISOString() });
    } catch (err: any) {
      res
        .status(503)
        .json({ status: "degraded", db: "error", error: err.message, timestamp: new Date().toISOString() });
    }
  });

  // === AUTH ROUTES ===
  app.post("/api/auth/register", async (req, res) => {
    try {
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

      // Auto-login after registration
      const { password, ...safeUser } = user;
      req.login(safeUser as any, (err) => {
        if (err)
          return res
            .status(500)
            .json({ message: "Login failed after registration" });
        return res.json(safeUser);
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Registration failed" });
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
    return res.json(req.user);
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
        status: req.query.status as string | undefined,
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
      } catch {
        // Non-fatal
      }

      return res.json({ ...book, matchedRequests });
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0]?.message || "Validation error" });
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
      const book = await storage.updateBook(id, req.user!.id, data);
      if (!book)
        return res.status(404).json({ message: "Book not found or not yours" });
      return res.json(book);
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ message: err.errors[0]?.message });
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
      const limit = Math.min(parseInt(limitStr) || 24, 100);
      // Support both offset and page-based pagination
      const page = parseInt(pageStr) || 1;
      const offset = parseInt(offsetStr) || (page - 1) * limit;

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
          .json({ message: err.errors[0]?.message || "Validation error" });
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
        return res.status(400).json({ message: err.errors[0]?.message });
      return res.status(500).json({ message: "Failed to update request" });
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
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;

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
      const returnUrl =
        req.body.returnUrl ||
        `${req.protocol}://${req.get("host")}/#/dashboard`;
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

  // Get fee info
  app.get("/api/payments/fee-info", (_req, res) => {
    return res.json({
      platformFeePercent: PLATFORM_FEE_PERCENT * 100,
      description: `Unshelv'd charges a ${PLATFORM_FEE_PERCENT * 100}% platform fee on each sale.`,
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
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
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event: Record<string, any>;

    if (webhookSecret) {
      // Production: require valid Stripe signature
      const sig = req.headers["stripe-signature"] as string;
      const rawBody = req.rawBody;
      if (!sig || !rawBody) {
        return res.status(400).json({ message: "Missing stripe-signature header or raw body" });
      }
      try {
        const { stripe } = await import("./payments");
        if (!stripe) return res.status(500).json({ message: "Stripe not configured" });
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
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

  // === USER ROUTES ===
  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const allowedFields = z.object({
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        location: z.string().max(100).optional(),
        avatarUrl: z.string().url().optional().or(z.literal("")),
      });
      const data = allowedFields.parse(req.body);
      const updated = await storage.updateUser(req.user!.id, data);
      if (!updated) return res.status(404).json({ message: "User not found" });
      const { password, ...safeUser } = updated;
      return res.json(safeUser);
    } catch (err) {
      if (err instanceof ZodError)
        return res.status(400).json({ message: err.errors[0]?.message });
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
        return res.status(400).json({ message: err.errors[0]?.message });
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseIntParam(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid user ID" });
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { password, ...safeUser } = user;
      return res.json(safeUser);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch user" });
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
      const message = await storage.createMessage(req.user!.id, data);
      return res.json(message);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0]?.message || "Validation error" });
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
      return res.json(offer);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0]?.message || "Validation error" });
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
      return res.json(offer);
    } catch (err) {
      if (err instanceof ZodError) {
        return res
          .status(400)
          .json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to update offer" });
    }
  });

  // ═══ Admin Routes ═══
  registerAdminRoutes(app);

  return httpServer;
}
