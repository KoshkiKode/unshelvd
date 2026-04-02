/**
 * Unshelv'd — Security Middleware & Utilities
 * 
 * - Helmet (HTTP security headers)
 * - Rate limiting (auth, payments, API)
 * - Input sanitization
 * - Parameter validation
 */

import helmet from "helmet";
import rateLimit, { type Options } from "express-rate-limit";
import type { Express, Request, Response, NextFunction } from "express";

/**
 * Apply all security middleware to the Express app
 */
export function applySecurityMiddleware(app: Express) {
  // ═══ Helmet — HTTP security headers ═══
  app.use(helmet({
    contentSecurityPolicy: false, // Vite dev server needs inline scripts
    crossOriginEmbedderPolicy: false, // Allow loading external images (book covers)
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow Capacitor
  }));

  // ═══ Rate Limiters ═══

  // Strict limit on auth routes (prevent brute force)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: { message: "Too many login attempts. Please try again in 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/register", authLimiter);

  // Moderate limit on payment routes
  const paymentLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 payment attempts per minute
    message: { message: "Too many payment attempts. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/payments/checkout", paymentLimiter);

  // General API rate limit (generous but prevents abuse)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: { message: "Rate limit exceeded. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/", apiLimiter);

  // Open Library search rate limit (be nice to their servers)
  const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { message: "Too many search requests. Please slow down." },
  });
  app.use("/api/search/", searchLimiter);
}

/**
 * Sanitize LIKE/ILIKE wildcard characters in search inputs
 * Prevents someone from passing % or _ to match everything
 */
export function sanitizeLikeInput(input: string): string {
  return input
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\\/g, "\\\\");
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
