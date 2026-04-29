import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import cors from "cors";
import { applySecurityMiddleware } from "./security";
import { pool } from "./storage";
import { runMigrations } from "./migrate";
import { runAutoSeed } from "./auto-seed";
import { startJobs } from "./jobs";

const app = express();

// Trust proxy — needed for ECS Fargate / load balancers, secure cookies, and rate limiting
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);

  // Security audit logs on startup
  if (!process.env.SESSION_SECRET) {
    console.warn(
      "⚠️  SECURITY WARNING: SESSION_SECRET is not set in production. Using insecure default.",
    );
  }
  if (!process.env.DATABASE_URL) {
    console.error(
      "❌ CRITICAL ERROR: DATABASE_URL is missing! Server will fail start.",
    );
  }
}

const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: Buffer | undefined;
  }
}

function trimTrailingSlash(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === 47) end -= 1; // '/'
  return url.slice(0, end);
}

function isHttpsRunAppOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".run.app");
  } catch {
    return false;
  }
}

// CORS — needed for Capacitor native apps and cross-origin requests
const defaultAllowedOrigins = [
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "http://localhost:3000",
  "http://localhost:5000",
  "http://10.0.2.2:5000",
  "https://unshelvd.koshkikode.com",
  "https://koshkikode.com",
  "https://www.koshkikode.com",
  "https://un-533c7f1e3dae462c8491ea28099ebb06.ecs.us-east-1.on.aws",
];

const envAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(
  [...defaultAllowedOrigins, ...envAllowedOrigins].map(trimTrailingSlash),
);

app.use(
  cors({
    origin: (origin, callback) => {
      // 1. Allow internal/same-origin requests (including same-host browser access)
      if (!origin) return callback(null, true);

      // 2. Explicitly allowed Capacitor and local development origins
      const normalizedOrigin = trimTrailingSlash(origin);
      if (allowedOrigins.has(normalizedOrigin) || isHttpsRunAppOrigin(normalizedOrigin)) {
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
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).replace(/[\r\n]/g, " ")}`;
      }

      log(logLine);
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
    // Runs AFTER listen() so the ECS health check sees the port open immediately.
    runAutoSeed().catch((err) => {
      console.error("Auto-seed failed (non-fatal):", err);
    });

    // Start background job runner (auto-complete transactions, expire offers).
    // Runs AFTER listen() — non-fatal if it fails.
    startJobs().catch((err) => {
      console.error("Job runner failed to start (non-fatal):", err);
    });
  } catch (err) {
    console.error("Fatal startup error:", err);
    process.exit(1);
  }
})();
