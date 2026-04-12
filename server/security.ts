/**
 * Unshelv'd — Security Middleware & Utilities
 * 
 * - Helmet (HTTP security headers + production CSP)
 * - Rate limiting (auth, payments, API) with shared PostgreSQL store
 * - Input sanitization
 * - Parameter validation
 */

import helmet from "helmet";
import rateLimit, { type Store, type ClientRateLimitInfo } from "express-rate-limit";
import type { Pool } from "pg";
import type { Express, Request, Response, NextFunction } from "express";

// Rate limiter window durations — defined at module level for easy tuning
const AUTH_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const PAYMENT_WINDOW_MS = 60 * 1000;    // 1 minute
const API_WINDOW_MS = 60 * 1000;        // 1 minute
const SEARCH_WINDOW_MS = 60 * 1000;     // 1 minute

/**
 * PostgreSQL-backed rate limit store for express-rate-limit.
 * Stores hit counters in the database so limits are correctly enforced
 * across multiple Cloud Run instances.
 */
export class PgRateLimitStore implements Store {
  private pool: Pool;
  private windowMs: number;
  // Promise-based singleton ensures the table is created exactly once,
  // even when multiple concurrent requests arrive before init completes.
  private initPromise: Promise<void> | null = null;

  constructor(pool: Pool, windowMs: number) {
    this.pool = pool;
    this.windowMs = windowMs;
  }

  /** Create the rate_limits table once on first use. */
  private ensureTable(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.pool
        .query(`
          CREATE TABLE IF NOT EXISTS rate_limits (
            key         TEXT         NOT NULL,
            hits        INTEGER      NOT NULL DEFAULT 1,
            reset_time  TIMESTAMPTZ  NOT NULL,
            PRIMARY KEY (key)
          )
        `)
        .then(() => undefined);
    }
    return this.initPromise;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    await this.ensureTable();
    const now = Date.now();
    const resetTime = new Date(now + this.windowMs);

    const result = await this.pool.query<{ hits: string; reset_time: Date }>(
      `INSERT INTO rate_limits (key, hits, reset_time)
         VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE
         SET hits       = CASE
                            WHEN rate_limits.reset_time <= NOW()
                            THEN 1
                            ELSE rate_limits.hits + 1
                          END,
             reset_time = CASE
                            WHEN rate_limits.reset_time <= NOW()
                            THEN $2
                            ELSE rate_limits.reset_time
                          END
       RETURNING hits, reset_time`,
      [key, resetTime],
    );

    return {
      totalHits: parseInt(result.rows[0].hits, 10),
      resetTime: result.rows[0].reset_time,
    };
  }

  async decrement(key: string): Promise<void> {
    await this.pool.query(
      `UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1`,
      [key],
    );
  }

  async resetKey(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM rate_limits WHERE key = $1`, [key]);
  }

  async resetAll(): Promise<void> {
    await this.pool.query(`TRUNCATE rate_limits`);
  }
}

// Production Content Security Policy directives
const productionCspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    // Stripe.js — needed for payment forms
    "https://js.stripe.com",
    // PayPal SDK
    "https://www.paypal.com",
    "https://www.sandbox.paypal.com",
    "https://www.paypalobjects.com",
    // Google AdSense (optional — only active when VITE_ADSENSE_CLIENT is set)
    "https://pagead2.googlesyndication.com",
    "https://partner.googleadservices.com",
  ],
  styleSrc: [
    "'self'",
    // Google Fonts stylesheet
    "https://fonts.googleapis.com",
    // Tailwind / shadcn inject inline styles at runtime
    "'unsafe-inline'",
  ],
  fontSrc: ["'self'", "https://fonts.gstatic.com"],
  imgSrc: [
    "'self'",
    "data:",
    // Open Library book covers
    "https://covers.openlibrary.org",
    // ISBNdb covers
    "https://images.isbndb.com",
    // Stripe-hosted images
    "https://*.stripe.com",
    // PayPal-hosted images
    "https://www.paypalobjects.com",
    "https://*.paypal.com",
    // Allow any HTTPS image (book covers come from many sources)
    "https:",
  ],
  connectSrc: [
    "'self'",
    "https://api.stripe.com",
    // Open Library search API (catalog import)
    "https://openlibrary.org",
    // PayPal API
    "https://www.paypal.com",
    "https://www.sandbox.paypal.com",
    "https://api-m.paypal.com",
    "https://api-m.sandbox.paypal.com",
    // Google AdSense
    "https://pagead2.googlesyndication.com",
  ],
  frameSrc: [
    // Stripe payment iframes
    "https://js.stripe.com",
    "https://hooks.stripe.com",
    // PayPal checkout popup/iframe
    "https://www.paypal.com",
    "https://www.sandbox.paypal.com",
  ],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
};

/**
 * Apply all security middleware to the Express app.
 * In production a shared PostgreSQL store is used for rate limiting so
 * limits are enforced correctly across all Cloud Run instances.
 */
export function applySecurityMiddleware(app: Express, pgPool?: Pool) {
  const isProduction = process.env.NODE_ENV === "production";

  // ═══ Helmet — HTTP security headers ═══
  // Apply CSP in production only — Vite's HMR requires inline scripts in dev.
  // Two separate helmet() calls avoid having contentSecurityPolicy:false in
  // the production code path (which would be misleading and trigger linters).
  if (isProduction) {
    app.use(
      helmet({
        contentSecurityPolicy: { directives: productionCspDirectives },
        crossOriginEmbedderPolicy: false, // Allow loading external images (book covers)
        crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Capacitor
      }),
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false, // Disabled in development — Vite needs inline scripts
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
      }),
    );
  }

  // ═══ Rate Limiters ═══
  // In production: use the shared PostgreSQL store so limits are enforced
  // across all Cloud Run instances (prevents 10× bypass with N instances).
  // In development: use the default in-memory store (no DB required).

  const makeStore = (windowMs: number) =>
    isProduction && pgPool ? new PgRateLimitStore(pgPool, windowMs) : undefined;

  // Strict limit on auth routes (prevent brute force)
  const authLimiter = rateLimit({
    windowMs: AUTH_WINDOW_MS,
    max: 10, // 10 attempts per window
    message: { message: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(AUTH_WINDOW_MS),
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/forgot-password", authLimiter);
  app.use("/api/auth/reset-password", authLimiter);

  // Moderate limit on payment routes
  const paymentLimiter = rateLimit({
    windowMs: PAYMENT_WINDOW_MS,
    max: 5, // 5 payment attempts per minute
    message: { message: "Too many payment attempts. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(PAYMENT_WINDOW_MS),
  });
  app.use("/api/payments/checkout", paymentLimiter);

  // General API rate limit (generous but prevents abuse)
  const apiLimiter = rateLimit({
    windowMs: API_WINDOW_MS,
    max: 100, // 100 requests per minute
    message: { message: "Rate limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(API_WINDOW_MS),
  });
  app.use("/api/", apiLimiter);

  // Open Library search rate limit (be nice to their servers)
  const searchLimiter = rateLimit({
    windowMs: SEARCH_WINDOW_MS,
    max: 20,
    message: { message: "Too many search requests. Please slow down." },
    store: makeStore(SEARCH_WINDOW_MS),
  });
  app.use("/api/search/", searchLimiter);
}

/**
 * Sanitize LIKE/ILIKE wildcard characters in search inputs
 * Prevents someone from passing % or _ to match everything
 */
export function sanitizeLikeInput(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * Validate and parse an integer parameter. Returns null if invalid.
 */
export function parseIntParam(value: string | string[] | undefined): number | null {
  if (Array.isArray(value)) value = value[0];
  if (!value) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || !isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Middleware to validate that :id param is a valid positive integer
 */
export function validateIdParam(req: Request, res: Response, next: NextFunction) {
  const id = parseIntParam(req.params.id);
  if (id === null) {
    return res.status(400).json({ message: "Invalid ID" });
  }
  next();
}

/**
 * Strip HTML/script tags from string input (defense in depth).
 * Removes complete tags (<tag>) and then removes any opening angle bracket
 * that begins an HTML tag but lacks a closing `>` (e.g. `<script`), while
 * preserving standalone `<` used in plain text (e.g. `a < b`).
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")          // remove complete HTML tags
    .replace(/<(?=[!/a-zA-Z])/g, ""); // remove incomplete tag openers (e.g. <script)
}
