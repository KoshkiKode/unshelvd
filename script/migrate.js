/**
 * Standalone migration runner for CI/CD pipelines and one-off jobs.
 *
 * Uses only production runtime deps (drizzle-orm + pg) — no drizzle-kit needed.
 * Reads SQL migration files from the ./migrations folder and applies any that
 * haven't been recorded in the drizzle migrations journal yet.
 *
 * Usage:
 *   node script/migrate.js
 *
 * Required env:
 *   DATABASE_URL — PostgreSQL connection string (RDS TCP or local Unix socket)
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌  DATABASE_URL is required");
    process.exit(1);
  }

  // Unix socket connections (local dev) don't use SSL; RDS requires SSL
  const isUnixSocket = process.env.DATABASE_URL.includes("host=/");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isUnixSocket
      ? false
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  });

  pool.on("error", (err) => {
    console.error("Pool error:", err.message);
  });

  try {
    const db = drizzle(pool);
    // migrations/ lives at the project root (/app/migrations in the container)
    const migrationsFolder = join(dirname(__dirname), "migrations");
    console.log("🗄️  Running migrations from", migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log("✅  Migrations applied successfully");
  } catch (err) {
    console.error("❌  Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
