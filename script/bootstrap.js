/**
 * Database Bootstrap — one-time setup for a brand-new Cloud SQL instance.
 *
 * This script:
 *   1. Ensures the `public` and `drizzle` schemas exist with correct permissions.
 *   2. Detects whether the database already has application tables and skips
 *      the destructive DROP/CREATE if data is present — making it SAFE to run
 *      after the first deploy without wiping production data.
 *
 * When to run:
 *   - First deploy only, BEFORE `script/migrate.js`.
 *   - If migrations fail with "schema already exists" or permission errors.
 *   - Never run manually on a live database with user data.
 *
 * Usage:
 *   DATABASE_URL="..." node script/bootstrap.js
 */

import pg from 'pg';
const { Client } = pg;

async function bootstrap() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }

  const isUnixSocket = process.env.DATABASE_URL.includes("host=/");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: isUnixSocket ? false : { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Check whether the database already has application tables.
    // If it does, we skip the destructive schema reset.
    const check = await client.query(`
      SELECT count(*) AS n
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'books', 'works', 'book_catalog')
    `);
    const existingTables = parseInt(check.rows[0].n, 10);

    if (existingTables > 0) {
      console.log(`Database already has ${existingTables} application table(s). Skipping schema reset.`);
      console.log('Ensuring schema permissions are correct...');
      // Only grant permissions — never drop
      await client.query('GRANT ALL ON SCHEMA public TO public;');
      try {
        await client.query('GRANT ALL ON SCHEMA public TO unshelvd;');
      } catch (_) { /* role may not exist in all environments */ }
      console.log('✅ Permissions refreshed. No data was modified.');
      return;
    }

    // Fresh database — safe to reset schemas
    console.log('No application tables found. Initialising schemas for first-time setup...');

    try {
      await client.query('ALTER DATABASE unshelvd OWNER TO unshelvd;');
    } catch (_) { /* may fail if already owned or role doesn't exist — non-fatal */ }

    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    try {
      await client.query('GRANT ALL ON SCHEMA public TO unshelvd;');
    } catch (_) { /* non-fatal */ }

    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE;');
    await client.query('CREATE SCHEMA drizzle;');
    try {
      await client.query('GRANT ALL ON SCHEMA drizzle TO unshelvd;');
    } catch (_) { /* non-fatal */ }

    console.log('✅ Database bootstrap complete. Run `node script/migrate.js` next.');
  } catch (err) {
    console.error('❌ Bootstrap failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

bootstrap();

