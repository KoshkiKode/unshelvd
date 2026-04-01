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

  // Alex's books — mix of English and international
  await db.insert(books).values([
    { userId: alex.id, title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", isbn: "9780374528379", coverUrl: cover("9780374528379"), condition: "fair", status: "for-sale", price: 14.50, genre: "Fiction", publisher: "Farrar, Straus and Giroux", year: 1880, language: "English", originalLanguage: "Russian", countryOfOrigin: "Russian Empire", era: "Antique (Pre-1900)" },
    { userId: alex.id, title: "A Brief History of Time", author: "Stephen Hawking", isbn: "9780553380163", coverUrl: cover("9780553380163"), condition: "new", status: "for-sale", price: 22.00, genre: "Non-Fiction,Science", publisher: "Bantam", year: 1988, language: "English", countryOfOrigin: "United Kingdom", era: "Modern (1970-2000)" },
    { userId: alex.id, title: "1984", author: "George Orwell", isbn: "9780451524935", coverUrl: cover("9780451524935"), condition: "good", status: "for-sale", price: 9.99, genre: "Fiction,Sci-Fi", publisher: "Signet Classics", year: 1949, language: "English", countryOfOrigin: "United Kingdom", era: "Vintage (1900-1970)" },
    { userId: alex.id, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn: "9780441478125", coverUrl: cover("9780441478125"), condition: "good", status: "open-to-offers", genre: "Sci-Fi", publisher: "Ace", year: 1969, language: "English", countryOfOrigin: "United States", era: "Vintage (1900-1970)" },
  ]);

  // Create a third user focused on international books
  const [mirko] = await db.insert(users).values({
    username: "mirko_knjige",
    displayName: "Mirko Petrović",
    email: "mirko@example.com",
    password: hashedPassword,
    bio: "Collector of Yugoslav, Soviet, and Eastern European literature. Originals only, no reprints.",
    location: "Belgrade, Serbia",
  }).returning();

  // Mirko's international collection
  await db.insert(books).values([
    { userId: mirko.id, title: "Na Drini ćuprija", author: "Ivo Andrić", isbn: "9788652118038", coverUrl: cover("9788652118038"), condition: "good", status: "for-sale", price: 35.00, genre: "Fiction,History", publisher: "Prosveta", year: 1945, language: "Serbian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Cyrillic" },
    { userId: mirko.id, title: "The Bridge on the Drina", author: "Ivo Andrić", isbn: "9780226020457", coverUrl: cover("9780226020457"), condition: "like-new", status: "for-sale", price: 18.00, genre: "Fiction,History", publisher: "University of Chicago Press", year: 1959, language: "English", originalLanguage: "Serbian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Latin" },
    { userId: mirko.id, title: "Мастер и Маргарита", author: "Михаил Булгаков", isbn: "9785170977871", coverUrl: cover("9785170977871"), condition: "fair", status: "open-to-offers", genre: "Fiction,Fantasy", publisher: "AST", year: 1967, language: "Russian", countryOfOrigin: "USSR / Soviet Union", era: "Vintage (1900-1970)", script: "Cyrillic" },
    { userId: mirko.id, title: "The Master and Margarita", author: "Mikhail Bulgakov", isbn: "9780141180144", coverUrl: cover("9780141180144"), condition: "good", status: "for-sale", price: 14.00, genre: "Fiction,Fantasy", publisher: "Penguin Classics", year: 1997, language: "English", originalLanguage: "Russian", countryOfOrigin: "USSR / Soviet Union", era: "Vintage (1900-1970)", script: "Latin" },
    { userId: mirko.id, title: "Derviš i smrt", author: "Meša Selimović", condition: "good", status: "for-sale", price: 28.00, genre: "Fiction,Philosophy", publisher: "Svjetlost", year: 1966, language: "Bosnian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Latin" },
    { userId: mirko.id, title: "Сталкер (Strugatsky brothers)", author: "Аркадий и Борис Стругацкие", condition: "fair", status: "open-to-offers", genre: "Sci-Fi", publisher: "Молодая гвардия", year: 1972, language: "Russian", countryOfOrigin: "USSR / Soviet Union", era: "Modern (1970-2000)", script: "Cyrillic" },
    { userId: mirko.id, title: "Kafka's Diaries", author: "Franz Kafka", isbn: "9780805209068", coverUrl: cover("9780805209068"), condition: "good", status: "not-for-sale", genre: "Non-Fiction,Biography", publisher: "Schocken", year: 1948, language: "English", originalLanguage: "German", countryOfOrigin: "Austria-Hungary", era: "Vintage (1900-1970)", script: "Latin" },
    { userId: mirko.id, title: "Prokleta avlija", author: "Ivo Andrić", condition: "fair", status: "for-sale", price: 22.00, genre: "Fiction", publisher: "Prosveta", year: 1954, language: "Serbian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Cyrillic" },
  ]);

  // Book requests
  await db.insert(bookRequests).values([
    { userId: alex.id, title: "Gravity's Rainbow", author: "Thomas Pynchon", description: "Penguin Classics edition or original Viking Press.", maxPrice: 45, edition: "Penguin Classics" },
    { userId: jane.id, title: "The Wind-Up Bird Chronicle", author: "Haruki Murakami", description: "Any edition in good condition. Hardcover preferred.", maxPrice: 30 },
    { userId: alex.id, title: "Infinite Jest", author: "David Foster Wallace", description: "Looking for a clean first edition, preferably with dust jacket intact.", maxPrice: 150, edition: "First Edition" },
    { userId: mirko.id, title: "Travnička hronika", author: "Ivo Andrić", description: "Original Yugoslav edition from Prosveta or Srpska književna zadruga. Cyrillic preferred.", maxPrice: 60, language: "Serbian", countryOfOrigin: "Yugoslavia" },
    { userId: mirko.id, title: "We", author: "Yevgeny Zamyatin", description: "Looking for an original Russian edition (Мы). Any Soviet-era print.", maxPrice: 100, language: "Russian", countryOfOrigin: "USSR / Soviet Union" },
  ]);

  console.log("Seed complete: 3 users, 20 books (international + historical), 5 requests.");
  await pool.end();
}

seed().catch(console.error);
