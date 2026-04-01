import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { users, books, bookRequests } from "@shared/schema";
import bcrypt from "bcryptjs";

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Seeding database...");

  // Check if already seeded
  const existing = await db.select().from(users);
  if (existing.length > 0) {
    console.log("Database already has data, skipping seed.");
    await pool.end();
    return;
  }

  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create users
  const [jane] = await db.insert(users).values({
    username: "bookworm",
    displayName: "Jane Reader",
    email: "jane@example.com",
    password: hashedPassword,
    bio: "Avid reader and collector. Always looking for rare first editions.",
    location: "Portland, OR",
  }).returning();

  const [alex] = await db.insert(users).values({
    username: "alexshelves",
    displayName: "Alex Shelves",
    email: "alex@example.com",
    password: hashedPassword,
    bio: "Philosophy and sci-fi enthusiast. My shelves are overflowing.",
    location: "Austin, TX",
  }).returning();

  // Jane's books (for-sale, open-to-offers, collection, reading, wishlist)
  await db.insert(books).values([
    { userId: jane.id, title: "Sapiens", author: "Yuval Noah Harari", condition: "like-new", status: "for-sale", price: 15.99, genre: "Non-Fiction", publisher: "Harper", edition: "1st", year: 2015 },
    { userId: jane.id, title: "Meditations", author: "Marcus Aurelius", condition: "fair", status: "for-sale", price: 12.00, genre: "Philosophy", publisher: "Penguin Classics", year: 180 },
    { userId: jane.id, title: "Blood Meridian", author: "Cormac McCarthy", condition: "good", status: "for-sale", price: 24.99, genre: "Fiction", publisher: "Vintage", year: 1985 },
    { userId: jane.id, title: "Dune", author: "Frank Herbert", condition: "good", status: "for-sale", price: 18.50, genre: "Sci-Fi", publisher: "Ace", year: 1965 },
    { userId: jane.id, title: "Kafka on the Shore", author: "Haruki Murakami", condition: "like-new", status: "open-to-offers", genre: "Fiction", publisher: "Vintage", year: 2005 },
    { userId: jane.id, title: "The Stranger", author: "Albert Camus", condition: "good", status: "not-for-sale", genre: "Fiction,Philosophy", publisher: "Vintage", year: 1942 },
    { userId: jane.id, title: "Norwegian Wood", author: "Haruki Murakami", condition: "like-new", status: "reading", genre: "Fiction", publisher: "Vintage", year: 1987 },
    { userId: jane.id, title: "House of Leaves", author: "Mark Z. Danielewski", condition: "new", status: "wishlist", genre: "Fiction,Horror", year: 2000 },
  ]);

  // Alex's books
  await db.insert(books).values([
    { userId: alex.id, title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", condition: "fair", status: "for-sale", price: 14.50, genre: "Fiction", publisher: "Farrar, Straus and Giroux", year: 1880 },
    { userId: alex.id, title: "A Brief History of Time", author: "Stephen Hawking", condition: "new", status: "for-sale", price: 22.00, genre: "Non-Fiction,Sci-Fi", publisher: "Bantam", year: 1988 },
    { userId: alex.id, title: "1984", author: "George Orwell", condition: "good", status: "for-sale", price: 9.99, genre: "Fiction,Sci-Fi", publisher: "Signet Classics", year: 1949 },
    { userId: alex.id, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", condition: "good", status: "open-to-offers", genre: "Sci-Fi", publisher: "Ace", year: 1969 },
  ]);

  // Book requests
  await db.insert(bookRequests).values([
    { userId: alex.id, title: "Gravity's Rainbow", author: "Thomas Pynchon", description: "Penguin Classics edition or original Viking Press.", maxPrice: 45, edition: "Penguin Classics" },
    { userId: jane.id, title: "The Wind-Up Bird Chronicle", author: "Haruki Murakami", description: "Any edition in good condition. Hardcover preferred.", maxPrice: 30 },
    { userId: alex.id, title: "Infinite Jest", author: "David Foster Wallace", description: "Looking for a clean first edition, preferably with dust jacket intact.", maxPrice: 150, edition: "First Edition" },
  ]);

  console.log("Seed complete: 2 users, 12 books, 3 requests.");
  await pool.end();
}

seed().catch(console.error);
