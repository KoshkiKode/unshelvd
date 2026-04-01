import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { users, books, bookRequests } from "@shared/schema";
import bcrypt from "bcryptjs";

// Open Library cover URLs by ISBN (no API call needed, these are static URLs)
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;

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

  // Jane's books — real covers via Open Library ISBN lookup
  await db.insert(books).values([
    { userId: jane.id, title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn: "9780062316097", coverUrl: cover("9780062316097"), condition: "like-new", status: "for-sale", price: 15.99, genre: "Non-Fiction,History", publisher: "Harper", edition: "1st", year: 2015 },
    { userId: jane.id, title: "Meditations", author: "Marcus Aurelius", isbn: "9780140449334", coverUrl: cover("9780140449334"), condition: "fair", status: "for-sale", price: 12.00, genre: "Philosophy", publisher: "Penguin Classics" },
    { userId: jane.id, title: "Blood Meridian", author: "Cormac McCarthy", isbn: "9780679728757", coverUrl: cover("9780679728757"), condition: "good", status: "for-sale", price: 24.99, genre: "Fiction", publisher: "Vintage", year: 1985 },
    { userId: jane.id, title: "Dune", author: "Frank Herbert", isbn: "9780441172719", coverUrl: cover("9780441172719"), condition: "good", status: "for-sale", price: 18.50, genre: "Sci-Fi", publisher: "Ace", year: 1965 },
    { userId: jane.id, title: "Kafka on the Shore", author: "Haruki Murakami", isbn: "9781400079278", coverUrl: cover("9781400079278"), condition: "like-new", status: "open-to-offers", genre: "Fiction", publisher: "Vintage", year: 2005 },
    { userId: jane.id, title: "The Stranger", author: "Albert Camus", isbn: "9780679720201", coverUrl: cover("9780679720201"), condition: "good", status: "not-for-sale", genre: "Fiction,Philosophy", publisher: "Vintage", year: 1942 },
    { userId: jane.id, title: "Norwegian Wood", author: "Haruki Murakami", isbn: "9780375704024", coverUrl: cover("9780375704024"), condition: "like-new", status: "reading", genre: "Fiction", publisher: "Vintage", year: 1987 },
    { userId: jane.id, title: "House of Leaves", author: "Mark Z. Danielewski", isbn: "9780375703768", coverUrl: cover("9780375703768"), condition: "new", status: "wishlist", genre: "Fiction,Horror", year: 2000 },
  ]);

  // Alex's books
  await db.insert(books).values([
    { userId: alex.id, title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", isbn: "9780374528379", coverUrl: cover("9780374528379"), condition: "fair", status: "for-sale", price: 14.50, genre: "Fiction", publisher: "Farrar, Straus and Giroux", year: 1880 },
    { userId: alex.id, title: "A Brief History of Time", author: "Stephen Hawking", isbn: "9780553380163", coverUrl: cover("9780553380163"), condition: "new", status: "for-sale", price: 22.00, genre: "Non-Fiction,Science", publisher: "Bantam", year: 1988 },
    { userId: alex.id, title: "1984", author: "George Orwell", isbn: "9780451524935", coverUrl: cover("9780451524935"), condition: "good", status: "for-sale", price: 9.99, genre: "Fiction,Sci-Fi", publisher: "Signet Classics", year: 1949 },
    { userId: alex.id, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn: "9780441478125", coverUrl: cover("9780441478125"), condition: "good", status: "open-to-offers", genre: "Sci-Fi", publisher: "Ace", year: 1969 },
  ]);

  // Book requests
  await db.insert(bookRequests).values([
    { userId: alex.id, title: "Gravity's Rainbow", author: "Thomas Pynchon", description: "Penguin Classics edition or original Viking Press.", maxPrice: 45, edition: "Penguin Classics" },
    { userId: jane.id, title: "The Wind-Up Bird Chronicle", author: "Haruki Murakami", description: "Any edition in good condition. Hardcover preferred.", maxPrice: 30 },
    { userId: alex.id, title: "Infinite Jest", author: "David Foster Wallace", description: "Looking for a clean first edition, preferably with dust jacket intact.", maxPrice: 150, edition: "First Edition" },
  ]);

  console.log("Seed complete: 2 users, 12 books (with real covers), 3 requests.");
  await pool.end();
}

seed().catch(console.error);
