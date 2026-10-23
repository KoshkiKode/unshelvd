import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";
import { applySecurityMiddleware, isAllowedOrigin } from "./security";
import { pool } from "./storage";
import { runMigrations } from "./migrate";
import { runAutoSeed } from "./auto-seed";
import { startJobs, stopJobs } from "./jobs";

const app = express();

// Trust proxy — needed for Cloud Run/load balancers, secure cookies, and rate limiting.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);

  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production");
  }
}

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: Buffer | undefined;
  }
}

// CORS — needed for Capacitor native apps and cross-origin requests.
// The allowlist (server/security.ts) is exact-match only. It must never trust a
// whole hosting suffix such as *.run.app: anyone can publish a page there, and
// with credentials enabled that would let their page make authenticated requests.
// Add extra origins via the CORS_ALLOWED_ORIGINS env var.
app.use(
  cors({
    origin: (origin, callback) => {
      // 1. Allow internal/same-origin requests (including same-host browser access)
      if (!origin) return callback(null, true);

      // 2. Explicitly allowed Capacitor, local development and production origins
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      // 3. For local development, be permissive to aid debugging
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      // 4. In production, maintain strict CORS
      console.error(`CORS BLOCKED: Rejected origin ${origin}`);
      callback(null, false);
    },
    credentials: true,
  }),
);

// Larger body limit for the image upload endpoint which receives base64 image data.
// • /api/upload/image  — cover images up to 2 MB raw (~2.67 MB in base64)
// body-parser skips re-parsing when req._body is already set, so registering
// this path-specific parser BEFORE the global one ensures correct behaviour
// without changing the limit for any other endpoint.
app.use(
  "/api/upload/image",
  express.json({
    limit: "3mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Default 100 kb body limit for all other endpoints
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Security middleware (Helmet headers + rate limiting)
applySecurityMiddleware(app, pool);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  try {
    // Run DB migrations before anything else (no-op in dev if migrations/ doesn't exist)
    // Applies the schema from migrations/ so all tables are created.
    await runMigrations();

    await registerRoutes(httpServer, app);
    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );

    // Auto-seed works + catalog on first run (no-op if already populated).
    // Runs AFTER listen() so the container health check sees the port open immediately.
    runAutoSeed().catch((err) => {
      console.error("Auto-seed failed (non-fatal):", err);
    });

    // Start background job runner (auto-complete transactions, expire offers).
    // Runs AFTER listen() — non-fatal if it fails.
    startJobs().catch((err) => {
      console.error("Job runner failed to start (non-fatal):", err);
    });

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      log(`received ${signal}; shutting down`);
      stopJobs();

      const forceExit = setTimeout(() => {
        console.error("Graceful shutdown timed out");
        process.exit(1);
      }, 10_000);
      forceExit.unref();

      httpServer.close(() => {
        pool.end()
          .catch((err) => console.error("Database pool shutdown failed:", err))
          .finally(() => process.exit(0));
      });
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
})();
