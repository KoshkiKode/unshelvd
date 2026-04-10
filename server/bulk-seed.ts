/**
 * Bulk seed — generates 100 demo user accounts each with 50 book listings.
 * Draws titles from the bookCatalog table so every listing references a real book.
 * Safe to run multiple times: skips generation when bulk users already exist.
 *
 * Usage: DATABASE_URL=... npx tsx server/bulk-seed.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { users, books, bookCatalog } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const isUnixSocket = (process.env.DATABASE_URL || "").includes("host=/");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isUnixSocket
    ? false
    : process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 10_000,
});
pool.on("error", (err) => console.error("Pool error:", err.message));
const db = drizzle(pool);

const TARGET_USERS = 100;
const BOOKS_PER_USER = 50;
const BULK_MARKER = "bulk-demo"; // role tag to identify generated users

const CONDITIONS = ["new", "like-new", "good", "fair", "poor"] as const;
const STATUSES = ["for-sale", "for-sale", "for-sale", "open-to-offers", "not-for-sale", "reading", "wishlist"] as const;
const GENRES = [
  "Fiction", "Non-Fiction", "Sci-Fi", "Fantasy", "Mystery", "Romance",
  "Philosophy", "History", "Biography", "Poetry", "Horror", "Drama",
];
const LOCATIONS = [
  "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
  "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
  "Dallas, TX", "San Jose, CA", "Austin, TX", "Jacksonville, FL",
  "Portland, OR", "Seattle, WA", "Denver, CO", "Boston, MA",
  "Nashville, TN", "Memphis, TN", "Louisville, KY", "Baltimore, MD",
  "London, UK", "Paris, France", "Berlin, Germany", "Toronto, Canada",
  "Sydney, Australia", "Tokyo, Japan", "Seoul, South Korea", "São Paulo, Brazil",
  "Mumbai, India", "Cairo, Egypt",
];

const FIRST_NAMES = [
  "Alice", "Bob", "Carol", "David", "Eva", "Frank", "Grace", "Henry",
  "Iris", "Jack", "Karen", "Leo", "Mia", "Nathan", "Olivia", "Paul",
  "Quinn", "Rose", "Sam", "Tina", "Uma", "Victor", "Wendy", "Xander",
  "Yasmin", "Zoe", "Aaron", "Beth", "Chris", "Diana",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Wilson", "Moore", "Taylor", "Anderson", "Thomas", "Jackson",
  "White", "Harris", "Martin", "Thompson", "Young", "Robinson",
  "Lewis", "Walker", "Hall", "Allen", "King", "Wright", "Scott",
  "Green", "Baker", "Adams",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function randomPrice(): number | null {
  if (Math.random() < 0.15) return null; // 15% no price
  return Math.round((Math.random() * 79 + 1) * 100) / 100;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  // ── Check if bulk users already exist ────────────────────────────────────
  const [{ count: existingBulk }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, BULK_MARKER));

  if (existingBulk >= TARGET_USERS) {
    console.log(`Bulk seed already done (${existingBulk} bulk users found). Skipping.`);
    await pool.end();
    return;
  }

  const already = existingBulk;
  const toCreate = TARGET_USERS - already;

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Unshelv'd — Bulk User Seeder                 ║`);
  console.log(`║  Creating ${toCreate} users × ${BOOKS_PER_USER} books = ${(toCreate * BOOKS_PER_USER).toLocaleString()} listings ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  // ── Load catalog entries to assign books from ─────────────────────────────
  const catalog = await db
    .select({
      title: bookCatalog.title,
      author: bookCatalog.author,
      isbn13: bookCatalog.isbn13,
      isbn10: bookCatalog.isbn10,
      coverUrl: bookCatalog.coverUrl,
      publisher: bookCatalog.publisher,
      publicationYear: bookCatalog.publicationYear,
      genre: bookCatalog.genre,
      language: bookCatalog.language,
    })
    .from(bookCatalog)
    .limit(10_000); // pull a generous pool to sample from

  if (catalog.length === 0) {
    console.error(
      "bookCatalog is empty. Run `npm run catalog:mass-seed` first to populate it."
    );
    await pool.end();
    process.exit(1);
  }

  console.log(`  Catalog pool: ${catalog.length.toLocaleString()} entries available\n`);

  // ── Single shared password for all demo accounts ─────────────────────────
  const sharedPassword = process.env.DEMO_PASSWORD || "DemoPass123!";
  const passwordHash = await bcrypt.hash(sharedPassword, 10);

  let totalUsersCreated = 0;
  let totalBooksCreated = 0;

  for (let i = 0; i < toCreate; i++) {
    const idx = already + i + 1; // globally unique index
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${idx}`;
    const displayName = `${firstName} ${lastName}`;
    const email = `${username}@demo.unshelvd.com`;
    const location = pick(LOCATIONS);

    const [user] = await db
      .insert(users)
      .values({
        username,
        displayName,
        email,
        password: passwordHash,
        bio: `Demo account #${idx}. Book lover from ${location}.`,
        location,
        role: BULK_MARKER,
      })
      .returning({ id: users.id });

    totalUsersCreated++;

    // Assign BOOKS_PER_USER books drawn randomly from catalog
    const picked = pickMany(catalog, BOOKS_PER_USER);
    const bookValues = picked.map((entry) => {
      const status = pick(STATUSES);
      return {
        userId: user.id,
        title: entry.title,
        author: entry.author,
        isbn: entry.isbn13 ?? entry.isbn10 ?? undefined,
        coverUrl: entry.coverUrl ?? undefined,
        publisher: entry.publisher ?? undefined,
        year: entry.publicationYear ?? undefined,
        genre: entry.genre ?? pick(GENRES),
        language: entry.language ?? "English",
        condition: pick(CONDITIONS),
        status,
        price: status === "for-sale" || status === "open-to-offers" ? randomPrice() : null,
      };
    });

    await db.insert(books).values(bookValues);
    totalBooksCreated += bookValues.length;

    if ((i + 1) % 10 === 0 || i + 1 === toCreate) {
      process.stdout.write(
        `  [${i + 1}/${toCreate}] ${username} — ${bookValues.length} books\n`
      );
    }
  }

  // ── Final counts ─────────────────────────────────────────────────────────
  const [{ count: totalUsers }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  const [{ count: totalBooks }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(books);

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  Done!`);
  console.log(`  Created: ${totalUsersCreated} users, ${totalBooksCreated} book listings`);
  console.log(`  DB totals: ${totalUsers} users, ${totalBooks} books`);
  console.log(`  Shared demo password: ${sharedPassword}`);
  console.log(`══════════════════════════════════════════════\n`);

  await pool.end();
}

main().catch(console.error);
