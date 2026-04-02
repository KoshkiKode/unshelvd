import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, loginSchema, insertBookSchema, insertBookRequestSchema, insertMessageSchema, insertOfferSchema, updateOfferSchema, books, bookCatalog, works } from "@shared/schema";
import { db } from "./storage";
import { eq, and, or, ilike, desc, asc, sql } from "drizzle-orm";
import { resolveWork, getWorkEditions, updateWorkStats } from "./work-resolver";
import { createPaymentIntent, confirmPayment, markShipped, confirmDelivery, getUserTransactions, PLATFORM_FEE_PERCENT } from "./payments";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import bcrypt from "bcryptjs";
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
  app: Express
): Promise<Server> {
  // Session setup
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "unshelvd-dev-secret-change-me",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        // For Capacitor native apps making cross-origin requests:
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        secure: process.env.NODE_ENV === "production",
      },
      // Trust the first proxy (Cloud Run, nginx, etc.)
      proxy: process.env.NODE_ENV === "production",
    })
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
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
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

  // === AUTH ROUTES ===
  app.post("/api/auth/register", async (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);

      // Check uniqueness
      const existingEmail = await storage.getUserByEmail(data.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }
      const existingUsername = await storage.getUserByUsername(data.username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({ ...data, password: hashedPassword });

      // Auto-login after registration
      const { password, ...safeUser } = user;
      req.login(safeUser as any, (err) => {
        if (err) return res.status(500).json({ message: "Login failed after registration" });
        return res.json(safeUser);
      });
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });

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
      const filters = {
        search: req.query.search as string | undefined,
        genre: req.query.genre as string | undefined,
        condition: req.query.condition as string | undefined,
        status: req.query.status as string | undefined,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        language: req.query.language as string | undefined,
        countryOfOrigin: req.query.countryOfOrigin as string | undefined,
        era: req.query.era as string | undefined,
        script: req.query.script as string | undefined,
        sort: req.query.sort as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      };
      const booksList = await storage.getBooks(filters);
      return res.json(booksList);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch books" });
    }
  });

  app.get("/api/books/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const booksList = await storage.getBooksByUser(userId);
      return res.json(booksList);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch user books" });
    }
  });

  app.get("/api/books/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const book = await storage.getBook(id);
      if (!book) return res.status(404).json({ message: "Book not found" });

      // Enrich with seller info
      const seller = await storage.getUser(book.userId);
      const sellerInfo = seller ? {
        id: seller.id,
        username: seller.username,
        displayName: seller.displayName,
        avatarUrl: seller.avatarUrl,
        rating: seller.rating,
        totalSales: seller.totalSales,
        location: seller.location,
      } : null;

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
      return res.json(book);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to create book" });
    }
  });

  app.patch("/api/books/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const book = await storage.updateBook(id, req.user!.id, req.body);
      if (!book) return res.status(404).json({ message: "Book not found or not yours" });
      return res.json(book);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update book" });
    }
  });

  app.delete("/api/books/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteBook(id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Book not found or not yours" });
      return res.json({ message: "Book deleted" });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete book" });
    }
  });

  // === BOOK REQUESTS ROUTES ===
  app.get("/api/requests", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const requests = await storage.getBookRequests(status ? { status } : undefined);

      // Enrich with user info
      const enriched = await Promise.all(
        requests.map(async (r) => {
          const user = await storage.getUser(r.userId);
          return {
            ...r,
            user: user ? { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl } : null,
          };
        })
      );

      return res.json(enriched);
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
        return res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to create request" });
    }
  });

  app.patch("/api/requests/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateBookRequest(id, req.user!.id, req.body);
      if (!updated) return res.status(404).json({ message: "Request not found or not yours" });
      return res.json(updated);
    } catch (err) {
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

      const fields = "title,author_name,first_publish_year,publisher,isbn,cover_i,subject,edition_count";
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=${fields}`;
      const response = await fetch(url);
      const data = await response.json() as any;

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
      const data = await response.json() as any;

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
        const term = `%${q}%`;
        conditions.push(
          or(
            ilike(bookCatalog.title, term),
            ilike(bookCatalog.titleNative, term),
            ilike(bookCatalog.author, term),
            ilike(bookCatalog.authorNative, term),
            eq(bookCatalog.isbn13, q.replace(/[^0-9X]/gi, "")),
          )
        );
      }
      if (lang) conditions.push(ilike(bookCatalog.language, `%${lang}%`));
      if (country) conditions.push(ilike(bookCatalog.countryOfOrigin, `%${country}%`));

      let query = db.select().from(bookCatalog);
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      query = query.orderBy(desc(bookCatalog.id)).limit(limit).offset(offset) as any;

      const results = await query;

      // Count total for pagination
      let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);
      if (conditions.length > 0) countQuery = countQuery.where(and(...conditions)) as any;
      const [{ count: total }] = await countQuery;

      return res.json({ results, total, limit, offset });
    } catch (err) {
      console.error("Catalog search error:", err);
      return res.status(500).json({ message: "Catalog search failed" });
    }
  });

  app.get("/api/catalog/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const rows = await db.select().from(bookCatalog).where(eq(bookCatalog.id, id));
      if (!rows[0]) return res.status(404).json({ message: "Not found" });

      // Also fetch user listings linked to this catalog entry
      const listings = await db.select().from(books).where(
        and(eq(books.catalogId, id), or(eq(books.status, "for-sale"), eq(books.status, "open-to-offers")))
      );

      return res.json({ ...rows[0], listings });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch catalog entry" });
    }
  });

  app.get("/api/catalog/stats", async (_req, res) => {
    try {
      const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);
      const [{ count: verified }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog).where(eq(bookCatalog.verified, true));

      // Language distribution
      const langDist = await db.select({
        language: bookCatalog.language,
        count: sql<number>`count(*)::int`,
      }).from(bookCatalog).groupBy(bookCatalog.language).orderBy(desc(sql`count(*)`)).limit(20);

      return res.json({ total, verified, languageDistribution: langDist });
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch catalog stats" });
    }
  });

  // === WORKS (edition graph) ===

  // Get a work with all its editions grouped by language
  app.get("/api/works/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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
        const term = `%${q}%`;
        query = query.where(
          or(
            ilike(works.title, term),
            ilike(works.titleOriginal, term),
            ilike(works.titleOriginalScript, term),
            ilike(works.author, term),
            ilike(works.authorOriginal, term),
          )
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
  app.post("/api/works/resolve", async (req, res) => {
    try {
      const { title, author, isbn, language, originalLanguage, year, coverUrl, genre } = req.body;
      if (!title || !author) {
        return res.status(400).json({ message: "title and author required" });
      }

      const result = await resolveWork({
        title, author, isbn, language, originalLanguage, year, coverUrl, genre,
      });

      // Fetch the work
      const [work] = await db.select().from(works).where(eq(works.id, result.workId));

      return res.json({ ...result, work });
    } catch (err) {
      console.error("Work resolve error:", err);
      return res.status(500).json({ message: "Failed to resolve work" });
    }
  });

  // Get all editions for a work as flat list
  app.get("/api/works/:id/editions", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const editions = await getWorkEditions(id);
      return res.json(editions);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch editions" });
    }
  });

  // Get user listings for a work
  app.get("/api/works/:id/listings", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const listings = await db.select().from(books)
        .where(
          and(
            eq(books.workId, id),
            or(eq(books.status, "for-sale"), eq(books.status, "open-to-offers"))
          )
        )
        .orderBy(asc(books.price));

      return res.json(listings);
    } catch (err) {
      return res.status(500).json({ message: "Failed to fetch listings" });
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
      const { bookId, offerId } = req.body;
      if (!bookId) return res.status(400).json({ message: "bookId required" });

      const result = await createPaymentIntent(req.user!.id, bookId, offerId);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Checkout failed" });
    }
  });

  // Confirm payment (after Stripe succeeds, or dev mode)
  app.post("/api/payments/:id/confirm", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await confirmPayment(id, req.user!.id);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Confirmation failed" });
    }
  });

  // Seller marks shipped
  app.post("/api/payments/:id/ship", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { carrier, trackingNumber } = req.body;
      const result = await markShipped(id, req.user!.id, carrier, trackingNumber);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Update failed" });
    }
  });

  // Buyer confirms delivery
  app.post("/api/payments/:id/deliver", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await confirmDelivery(id, req.user!.id);
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Confirmation failed" });
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
    // In production, verify the webhook signature:
    // const sig = req.headers['stripe-signature'];
    // const event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    try {
      const event = req.body;
      if (event.type === "payment_intent.succeeded") {
        const transactionId = parseInt(event.data.object.metadata.transactionId);
        const buyerId = parseInt(event.data.object.metadata.buyerId);
        if (transactionId && buyerId) {
          await confirmPayment(transactionId, buyerId);
        }
      }
      return res.json({ received: true });
    } catch (err) {
      return res.status(400).json({ message: "Webhook failed" });
    }
  });

  // === USER ROUTES ===
  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
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
      const otherUserId = parseInt(req.params.userId);
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
        return res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
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
      if (book.userId === req.user!.id) return res.status(400).json({ message: "Cannot make offer on your own book" });
      if (book.status !== "open-to-offers" && book.status !== "for-sale") {
        return res.status(400).json({ message: "This book is not accepting offers" });
      }

      const offer = await storage.createOffer(req.user!.id, book.userId, data);
      return res.json(offer);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to create offer" });
    }
  });

  app.patch("/api/offers/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = updateOfferSchema.parse(req.body);
      const offer = await storage.updateOffer(id, req.user!.id, data.status, data.counterAmount);
      if (!offer) return res.status(404).json({ message: "Offer not found or not yours" });
      return res.json(offer);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message || "Validation error" });
      }
      return res.status(500).json({ message: "Failed to update offer" });
    }
  });

  return httpServer;
}
