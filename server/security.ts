/**
 * Unshelv'd — Security Middleware & Utilities
 * 
 * - Helmet (HTTP security headers + production CSP + explicit HSTS)
 * - Rate limiting (auth, payments, PayPal, API) with shared PostgreSQL store
 * - CSRF protection via custom-header technique
 * - Input sanitization
 * - Parameter validation
 */

import helmet from "helmet";
import rateLimit, { type Store, type ClientRateLimitInfo } from "express-rate-limit";
import type { Pool } from "pg";
import type { Express, Request, Response, NextFunction } from "express";

// ═══ Allowed origins ═══
// One exact-match allowlist shared by CORS (server/index.ts) and the CSRF origin
// check below. There is deliberately NO wildcard or suffix matching: anyone can
// host a page on a public hosting domain (e.g. their own *.run.app Cloud Run
// service), so trusting a whole suffix would let an attacker's page pass CORS
// with credentials and also pass the CSRF header check. To allow another origin,
// list it in the CORS_ALLOWED_ORIGINS env var (comma-separated, exact origins).
const DEFAULT_ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://10.0.2.2:5000",
  "https://unshelvd.koshkikode.com",
  "https://koshkikode.com",
  "https://www.koshkikode.com",
  // Add additional origins via CORS_ALLOWED_ORIGINS instead of editing this list.
];

export function trimTrailingSlash(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1; // '/'
  return url.slice(0, end);
}

let allowedOriginsCache: { raw: string; origins: Set<string> } | null = null;

/** The effective allowlist: built-in origins plus CORS_ALLOWED_ORIGINS. */
export function getAllowedOrigins(): Set<string> {
  const raw = process.env.CORS_ALLOWED_ORIGINS ?? "";
  if (!allowedOriginsCache || allowedOriginsCache.raw !== raw) {
    const fromEnv = raw
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    allowedOriginsCache = {
      raw,
      origins: new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv].map(trimTrailingSlash)),
    };
  }
  return allowedOriginsCache.origins;
}

/** True only for an origin that is exactly on the allowlist. */
export function isAllowedOrigin(origin: string): boolean {
  return getAllowedOrigins().has(trimTrailingSlash(origin));
}

// Rate limiter window durations — defined at module level for easy tuning
const AUTH_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes
const PAYMENT_WINDOW_MS = 60 * 1000;    // 1 minute
const API_WINDOW_MS = 60 * 1000;        // 1 minute
const SEARCH_WINDOW_MS = 60 * 1000;     // 1 minute
const RESEND_WINDOW_MS = 60 * 1000;     // 1 minute

/**
 * PostgreSQL-backed rate limit store for express-rate-limit.
 * Stores hit counters in the database so limits are correctly enforced
 * across multiple server instances.
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
        .then(() => undefined)
        .catch((err) => {
          // Clear the cached promise so the next request retries table creation
          this.initPromise = null;
          throw err;
        });
    }
    return this.initPromise;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    const resetTime = new Date(now + this.windowMs);

    try {
      await this.ensureTable();

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
    } catch (err) {
      // Fail open: when the DB is unavailable, allow the request through rather
      // than returning a 500 to the user.  The effective hit count of 0 ensures
      // express-rate-limit does not block the request.
      console.error("[rate-limit] increment failed, failing open:", err);
      return { totalHits: 0, resetTime };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key = $1`,
        [key],
      );
    } catch (err) {
      console.error("[rate-limit] decrement failed:", err);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.pool.query(`DELETE FROM rate_limits WHERE key = $1`, [key]);
    } catch (err) {
      console.error("[rate-limit] resetKey failed:", err);
    }
  }

  async resetAll(): Promise<void> {
    try {
      await this.pool.query(`TRUNCATE rate_limits`);
    } catch (err) {
      console.error("[rate-limit] resetAll failed:", err);
    }
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
    // Fontshare fonts (Zodiak + Satoshi)
    "https://api.fontshare.com",
    // Tailwind / shadcn inject inline styles at runtime
    "'unsafe-inline'",
  ],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.fontshare.com"],
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
    // Fontshare (preconnect hint in index.html)
    "https://api.fontshare.com",
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

// Endpoints that external providers call server-to-server. They authenticate with
// their own signature headers (Stripe-Signature / PayPal transmission headers)
// instead of a browser session, so the browser-oriented CSRF check does not apply.
// Keep this list exact and short: every entry skips CSRF protection.
const CSRF_EXEMPT_PATHS = new Set(["/api/payments/stripe/webhook"]);
const CSRF_EXEMPT_PREFIXES = ["/api/webhooks/"];

/**
 * CSRF protection for cookie-authenticated, state-changing requests.
 *
 * Session cookies use SameSite=None in production (required for the Capacitor
 * native app to make cross-origin requests), which disables the browser's
 * built-in cross-site-request protection. We compensate with two checks:
 *
 *  1. A custom request header. The client (queryClient.ts -> apiRequest) attaches
 *     "X-App-CSRF: 1" to every mutation; a cross-site form or redirect cannot set
 *     a custom header, and a cross-origin fetch can only do so if CORS allows it.
 *  2. An Origin check. When the browser sends an Origin header it must be this
 *     server's own origin or on the exact allowlist. This keeps the header check
 *     from being the only line of defence if CORS is ever misconfigured. Requests
 *     with no Origin header (native HTTP clients, curl) rely on check 1 alone.
 *
 * Pass enforce=false to disable (development: cookies are SameSite=Lax there and
 * curl/Postman should work freely).
 */
export function createCsrfProtection(enforce: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enforce) return next();

    const method = req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return next();

    if (CSRF_EXEMPT_PATHS.has(req.path) || CSRF_EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) {
      return next();
    }

    if (!req.headers["x-app-csrf"]) {
      return res.status(403).json({ message: "CSRF validation failed" });
    }

    const origin = req.headers.origin;
    if (typeof origin === "string") {
      const host = req.get("host");
      const sameOrigin = !!host && trimTrailingSlash(origin) === `${req.protocol}://${host}`;
      if (!sameOrigin && !isAllowedOrigin(origin)) {
        return res.status(403).json({ message: "CSRF validation failed" });
      }
    }

    return next();
  };
}

/**
 * Apply all security middleware to the Express app.
 * In production a shared PostgreSQL store is used for rate limiting so
 * limits are enforced correctly across all server instances.
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
        // Explicit HSTS — tells browsers to always use HTTPS for this domain for 1 year.
        // Session cookies are SameSite=None in production (required for Capacitor), so
        // HSTS is the primary mechanism ensuring all traffic is encrypted in transit.
        hsts: {
          maxAge: 31536000,       // 1 year in seconds
          includeSubDomains: true,
          preload: true,
        },
      }),
    );
  } else {
    app.use(
      helmet({
        contentSecurityPolicy: false, // Disabled in development — Vite needs inline scripts
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" },
        hsts: false, // No HTTPS in local development, so HSTS would be meaningless
      }),
    );
  }

  // ═══ CSRF Protection — custom request header + Origin check ═══
  // See createCsrfProtection() for the full rationale. Only enforced in production.
  app.use(createCsrfProtection(isProduction));

  // ═══ Rate Limiters ═══
  // In production: use the shared PostgreSQL store so limits are enforced
  // across all server instances (prevents N× bypass with N instances).
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
  // Brute-forcing the current-password field on change-password carries the same
  // risk as brute-forcing the login endpoint, so apply the same strict limit.
  app.use("/api/auth/change-password", authLimiter);

  // Resend verification email — prevent email-service abuse by logged-in users
  const resendVerificationLimiter = rateLimit({
    windowMs: RESEND_WINDOW_MS,
    max: 3, // 3 resend attempts per minute
    message: { message: "Too many verification email requests. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(RESEND_WINDOW_MS),
  });
  app.use("/api/auth/resend-verification", resendVerificationLimiter);

  // Moderate limit on payment routes (Stripe + PayPal)
  const paymentLimiter = rateLimit({
    windowMs: PAYMENT_WINDOW_MS,
    max: 5, // 5 payment attempts per minute
    message: { message: "Too many payment attempts. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(PAYMENT_WINDOW_MS),
  });
  app.use("/api/payments/checkout", paymentLimiter);
  // PayPal create-order and capture-order carry the same monetary risk as the
  // Stripe checkout route, so they share the same strict payment limiter.
  app.use("/api/payments/paypal/create-order", paymentLimiter);
  app.use("/api/payments/paypal/capture-order", paymentLimiter);

  // General API rate limit (generous but prevents abuse)
  const apiLimiter = rateLimit({
    windowMs: API_WINDOW_MS,
    max: 100, // 100 requests per minute
    message: { message: "Rate limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
    // Avoid overlapping counters/headers on routes with dedicated limiters.
    skip: (req) => {
      const path = req.path;
      return (
        path.startsWith("/api/auth/") || path.startsWith("/auth/") ||
        path.startsWith("/api/search/") || path.startsWith("/search/") ||
        path.startsWith("/api/payments/checkout") || path.startsWith("/payments/checkout") ||
        path.startsWith("/api/payments/paypal/create-order") || path.startsWith("/payments/paypal/create-order") ||
        path.startsWith("/api/payments/paypal/capture-order") || path.startsWith("/payments/paypal/capture-order")
      );
    },
    store: makeStore(API_WINDOW_MS),
  });
  app.use("/api/", apiLimiter);

  // Open Library search rate limit (be nice to their servers)
  const searchLimiter = rateLimit({
    windowMs: SEARCH_WINDOW_MS,
    max: 20,
    message: { message: "Too many search requests. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
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
