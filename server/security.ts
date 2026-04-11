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

/**
 * PostgreSQL-backed rate limit store for express-rate-limit.
 * Stores hit counters in the database so limits are correctly enforced
 * across multiple Cloud Run instances.
 */
class PgRateLimitStore implements Store {
  private pool: Pool;
  private windowMs: number;
  private initialized = false;

  constructor(pool: Pool, windowMs: number) {
    this.pool = pool;
    this.windowMs = windowMs;
  }

  /** Create the rate_limits table once on first use. */
  private async ensureTable(): Promise<void> {
    if (this.initialized) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS rate_limits (
        key         TEXT         NOT NULL,
        hits        INTEGER      NOT NULL DEFAULT 1,
        reset_time  TIMESTAMPTZ  NOT NULL,
        PRIMARY KEY (key)
      )
    `);
    this.initialized = true;
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

/**
 * Apply all security middleware to the Express app.
 * In production a shared PostgreSQL store is used for rate limiting so
 * limits are enforced correctly across all Cloud Run instances.
 */
export function applySecurityMiddleware(app: Express, pgPool?: Pool) {
  const isProduction = process.env.NODE_ENV === "production";

  // ═══ Helmet — HTTP security headers ═══
  app.use(
    helmet({
      // In production enforce a Content Security Policy.
      // In development keep it off so Vite's HMR / inline scripts work.
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: [
                "'self'",
                // Stripe.js — needed for payment forms
                "https://js.stripe.com",
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
                // Allow any HTTPS image (book covers come from many sources)
                "https:",
              ],
              connectSrc: [
                "'self'",
                "https://api.stripe.com",
                // Open Library search API (catalog import)
                "https://openlibrary.org",
              ],
              frameSrc: [
                // Stripe payment iframes
                "https://js.stripe.com",
                "https://hooks.stripe.com",
              ],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false, // Allow loading external images (book covers)
      crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Capacitor
    }),
  );

  // ═══ Rate Limiters ═══
  // In production: use the shared PostgreSQL store so limits are enforced
  // across all Cloud Run instances (prevents 10× bypass with 10 instances).
  // In development: use the default in-memory store (no DB required).

  const makeStore = (windowMs: number) =>
    isProduction && pgPool ? new PgRateLimitStore(pgPool, windowMs) : undefined;

  // Strict limit on auth routes (prevent brute force)
  const authWindowMs = 15 * 60 * 1000; // 15 minutes
  const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: 10, // 10 attempts per window
    message: { message: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(authWindowMs),
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);

  // Moderate limit on payment routes
  const paymentWindowMs = 60 * 1000; // 1 minute
  const paymentLimiter = rateLimit({
    windowMs: paymentWindowMs,
    max: 5, // 5 payment attempts per minute
    message: { message: "Too many payment attempts. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(paymentWindowMs),
  });
  app.use("/api/payments/checkout", paymentLimiter);

  // General API rate limit (generous but prevents abuse)
  const apiWindowMs = 60 * 1000; // 1 minute
  const apiLimiter = rateLimit({
    windowMs: apiWindowMs,
    max: 100, // 100 requests per minute
    message: { message: "Rate limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(apiWindowMs),
  });
  app.use("/api/", apiLimiter);

  // Open Library search rate limit (be nice to their servers)
  const searchWindowMs = 60 * 1000;
  const searchLimiter = rateLimit({
    windowMs: searchWindowMs,
    max: 20,
    message: { message: "Too many search requests. Please slow down." },
    store: makeStore(searchWindowMs),
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
 * Strip HTML/script tags from string input (defense in depth)
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}
