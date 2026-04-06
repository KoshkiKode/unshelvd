import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { users, books, bookRequests, works, bookCatalog } from "@shared/schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sql } from "drizzle-orm";

// Open Library cover URLs by ISBN
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
// Open Library cover URLs by cover ID
const coverById = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

async function seed() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  const db = drizzle(pool);

  console.log("Seeding database...");

  const existingUsers = await db.select().from(users);
  const skipUsers = existingUsers.length > 0;
  if (skipUsers) {
    console.log("Users already exist — skipping user/book/request seed.");
  }

  // ═══════════════════════════════════════
  // WORKS & CATALOG — seed even on existing installs if tables are empty
  // ═══════════════════════════════════════
  const [{ count: worksCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(works);
  const [{ count: catalogCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);
  const needsWorks = worksCount === 0;
  const needsCatalog = catalogCount === 0;

  if (!needsWorks && !needsCatalog && skipUsers) {
    console.log("Database already fully seeded, skipping.");
    await pool.end();
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 1 — CANONICAL WORKS
  // One row per literary work (all editions/translations link here)
  // ═══════════════════════════════════════════════════════════════
  let workMap = new Map<string, number>(); // "title|author" -> id

  if (needsWorks || needsCatalog) {
    console.log("Seeding works and catalog...");

    const worksValues = [
      // — English literature —
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", originalLanguage: "Hebrew", firstPublishedYear: 2011, genre: "Non-Fiction,History", description: "A brief history of humankind from the Stone Age to the present.", coverUrl: cover("9780062316097"), source: "manual", verified: true },
      { title: "Meditations", author: "Marcus Aurelius", originalLanguage: "Ancient Greek", firstPublishedYear: 180, genre: "Philosophy", description: "Personal writings of the Roman Emperor Marcus Aurelius reflecting Stoic philosophy.", coverUrl: cover("9780140449334"), source: "manual", verified: true },
      { title: "Blood Meridian", author: "Cormac McCarthy", originalLanguage: "English", firstPublishedYear: 1985, genre: "Fiction", description: "An epic novel of the violence and depravity that attended America's westward expansion.", coverUrl: cover("9780679728757"), source: "manual", verified: true },
      { title: "Dune", author: "Frank Herbert", originalLanguage: "English", firstPublishedYear: 1965, genre: "Sci-Fi,Fiction", description: "Set in the far future amidst a feudal interstellar society, Dune tells the story of young Paul Atreides.", coverUrl: cover("9780441172719"), source: "manual", verified: true },
      { title: "Kafka on the Shore", author: "Haruki Murakami", originalLanguage: "Japanese", firstPublishedYear: 2002, genre: "Fiction", description: "A metaphysical fantasy about a fifteen-year-old boy who runs away from home.", coverUrl: cover("9781400079278"), source: "manual", verified: true },
      { title: "The Stranger", author: "Albert Camus", titleOriginal: "L'Étranger", originalLanguage: "French", firstPublishedYear: 1942, genre: "Fiction,Philosophy", description: "The story of an ordinary man who unwittingly gets drawn into a senseless murder.", coverUrl: cover("9780679720201"), source: "manual", verified: true },
      { title: "Norwegian Wood", author: "Haruki Murakami", titleOriginalScript: "ノルウェイの森", originalLanguage: "Japanese", firstPublishedYear: 1987, genre: "Fiction", description: "A nostalgic story of loss and sexuality set in Tokyo during the late 1960s.", coverUrl: cover("9780375704024"), source: "manual", verified: true },
      { title: "House of Leaves", author: "Mark Z. Danielewski", originalLanguage: "English", firstPublishedYear: 2000, genre: "Fiction,Horror", description: "A mind-bending postmodern horror novel, structured as an academic work.", coverUrl: cover("9780375703768"), source: "manual", verified: true },
      // — Russian literature —
      { title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", titleOriginal: "Братья Карамазовы", originalLanguage: "Russian", firstPublishedYear: 1880, genre: "Fiction", description: "A philosophical novel about faith, doubt, reason, and free will.", coverUrl: cover("9780374528379"), source: "manual", verified: true },
      { title: "The Master and Margarita", author: "Mikhail Bulgakov", titleOriginal: "Мастер и Маргарита", titleOriginalScript: "Мастер и Маргарита", originalLanguage: "Russian", firstPublishedYear: 1967, genre: "Fiction,Fantasy", description: "The Devil visits Soviet Moscow with his retinue, wreaking havoc.", coverUrl: cover("9780141180144"), source: "manual", verified: true },
      { title: "Roadside Picnic", author: "Arkady and Boris Strugatsky", titleOriginal: "Пикник на обочине", originalLanguage: "Russian", firstPublishedYear: 1972, genre: "Sci-Fi", description: "Alien visitors leave behind a Zone of mysterious artefacts — basis for Tarkovsky's Stalker.", coverUrl: coverById(8443792), source: "manual", verified: true },
      { title: "Crime and Punishment", author: "Fyodor Dostoevsky", titleOriginal: "Преступление и наказание", originalLanguage: "Russian", firstPublishedYear: 1866, genre: "Fiction", description: "A student kills a pawnbroker for money, then navigates guilt and redemption.", coverUrl: coverById(8479260), source: "manual", verified: true },
      { title: "War and Peace", author: "Leo Tolstoy", titleOriginal: "Война и мир", titleOriginalScript: "Война и мир", originalLanguage: "Russian", firstPublishedYear: 1869, genre: "Fiction,History", description: "A sweeping chronicle of Russian society during the Napoleonic era.", coverUrl: coverById(8228691), source: "manual", verified: true },
      // — South Slavic literature —
      { title: "The Bridge on the Drina", author: "Ivo Andrić", titleOriginal: "Na Drini ćuprija", originalLanguage: "Serbian", firstPublishedYear: 1945, genre: "Fiction,History", description: "Three centuries of Bosnian history seen through the bridge on the Drina river.", coverUrl: cover("9780226020457"), source: "manual", verified: true },
      { title: "Death and the Dervish", author: "Meša Selimović", titleOriginal: "Derviš i smrt", originalLanguage: "Bosnian", firstPublishedYear: 1966, genre: "Fiction,Philosophy", description: "A meditation on justice, guilt, and power in Ottoman Bosnia.", coverUrl: coverById(13127483), source: "manual", verified: true },
      { title: "The Damned Yard", author: "Ivo Andrić", titleOriginal: "Prokleta avlija", originalLanguage: "Serbian", firstPublishedYear: 1954, genre: "Fiction", description: "Stories within stories told in a Turkish prison yard in Istanbul.", coverUrl: coverById(8394082), source: "manual", verified: true },
      // — Classical / other —
      { title: "A Brief History of Time", author: "Stephen Hawking", originalLanguage: "English", firstPublishedYear: 1988, genre: "Non-Fiction,Science", description: "A landmark volume in science writing by one of the great minds of our time.", coverUrl: cover("9780553380163"), source: "manual", verified: true },
      { title: "1984", author: "George Orwell", titleOriginal: "Nineteen Eighty-Four", originalLanguage: "English", firstPublishedYear: 1949, genre: "Fiction,Sci-Fi", description: "A dystopian novel about totalitarianism, surveillance, and oppression.", coverUrl: cover("9780451524935"), source: "manual", verified: true },
      { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", originalLanguage: "English", firstPublishedYear: 1969, genre: "Sci-Fi", description: "A science fiction novel exploring gender identity on a planet of androgynes.", coverUrl: cover("9780441478125"), source: "manual", verified: true },
      { title: "The Diaries of Franz Kafka", author: "Franz Kafka", titleOriginal: "Tagebücher", originalLanguage: "German", firstPublishedYear: 1948, genre: "Non-Fiction,Biography", description: "Kafka's personal diaries, revealing his inner life and literary process.", coverUrl: cover("9780805209068"), source: "manual", verified: true },
      // — Additional world literature for catalog depth —
      { title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", titleOriginal: "Cien años de soledad", originalLanguage: "Spanish", firstPublishedYear: 1967, genre: "Fiction", description: "The Buendía family's multi-generational story in the mythical town of Macondo.", coverUrl: coverById(8411716), source: "manual", verified: true },
      { title: "Don Quixote", author: "Miguel de Cervantes", titleOriginal: "El ingenioso hidalgo don Quijote de la Mancha", originalLanguage: "Spanish", firstPublishedYear: 1605, genre: "Fiction", description: "A man from La Mancha believes himself a knight-errant and sets out on adventures.", coverUrl: coverById(8416816), source: "manual", verified: true },
      { title: "Things Fall Apart", author: "Chinua Achebe", originalLanguage: "English", firstPublishedYear: 1958, genre: "Fiction", description: "The story of Okonkwo and the arrival of colonialism in Nigeria.", coverUrl: coverById(8468612), source: "manual", verified: true },
      { title: "The Divine Comedy", author: "Dante Alighieri", titleOriginal: "Divina Commedia", originalLanguage: "Italian", firstPublishedYear: 1320, genre: "Poetry,Fiction", description: "Dante's journey through Hell, Purgatory, and Paradise guided by Virgil and Beatrice.", coverUrl: coverById(8470260), source: "manual", verified: true },
      { title: "Hamlet", author: "William Shakespeare", originalLanguage: "English", firstPublishedYear: 1603, genre: "Fiction,Drama", description: "Prince Hamlet's quest for revenge against his uncle, who has murdered his father.", coverUrl: coverById(8471820), source: "manual", verified: true },
    ];

    // Insert works only if table is empty; otherwise load existing works for catalog linking
    let allWorksRows: { id: number; title: string; author: string }[];
    if (needsWorks) {
      allWorksRows = await db.insert(works).values(worksValues).returning();
    } else {
      allWorksRows = await db.select({ id: works.id, title: works.title, author: works.author }).from(works);
    }

    for (const w of allWorksRows) {
      workMap.set(`${w.title}|${w.author}`, w.id);
    }

    const wid = (title: string, author: string) => workMap.get(`${title}|${author}`) ?? null;

    // ═══════════════════════════════════════════════════════════════
    // STEP 2 — BOOK CATALOG (only if empty)
    // Master database of published editions (multiple per work)
    // ═══════════════════════════════════════════════════════════════
    if (needsCatalog) {
      await db.insert(bookCatalog).values([
      // Sapiens
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn13: "9780062316097", isbn10: "0062316095", language: "English", publisher: "Harper", publicationYear: 2015, firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: cover("9780062316097"), source: "manual", verified: true, workId: wid("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn13: "9780099590088", language: "English", publisher: "Vintage", publicationYear: 2015, firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: cover("9780099590088"), source: "manual", verified: true, workId: wid("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
      { title: "קיצור תולדות האנושות", author: "יובל נח הררי", titleRomanized: "Kitsur Toldot HaEnoshut", isbn13: "9789655601695", language: "Hebrew", countryOfOrigin: "Israel", script: "Hebrew (עברית)", textDirection: "rtl", publisher: "Dvir", publicationYear: 2011, firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: coverById(7781014), source: "manual", verified: true, workId: wid("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
      // Meditations
      { title: "Meditations", author: "Marcus Aurelius", isbn13: "9780140449334", isbn10: "0140449337", language: "English", originalLanguage: "Ancient Greek", publisher: "Penguin Classics", publicationYear: 2006, firstPublishedYear: 180, genre: "Philosophy", coverUrl: cover("9780140449334"), source: "manual", verified: true, workId: wid("Meditations", "Marcus Aurelius") },
      { title: "Meditations", author: "Marcus Aurelius", isbn13: "9780486298238", language: "English", publisher: "Dover", publicationYear: 1997, firstPublishedYear: 180, genre: "Philosophy", coverUrl: cover("9780486298238"), source: "manual", workId: wid("Meditations", "Marcus Aurelius") },
      { title: "Τὰ εἰς ἑαυτόν", author: "Μάρκος Αὐρήλιος", titleRomanized: "Ta eis heauton", language: "Ancient Greek", script: "Greek", publisher: "Akademische Verlagsgesellschaft", publicationYear: 1960, firstPublishedYear: 180, genre: "Philosophy", source: "manual", workId: wid("Meditations", "Marcus Aurelius") },
      // Blood Meridian
      { title: "Blood Meridian, or the Evening Redness in the West", author: "Cormac McCarthy", isbn13: "9780679728757", isbn10: "0679728759", language: "English", publisher: "Vintage", publicationYear: 1992, firstPublishedYear: 1985, genre: "Fiction", coverUrl: cover("9780679728757"), source: "manual", verified: true, workId: wid("Blood Meridian", "Cormac McCarthy") },
      // Dune
      { title: "Dune", author: "Frank Herbert", isbn13: "9780441172719", isbn10: "0441172717", language: "English", publisher: "Ace", publicationYear: 1990, firstPublishedYear: 1965, genre: "Sci-Fi,Fiction", coverUrl: cover("9780441172719"), source: "manual", verified: true, workId: wid("Dune", "Frank Herbert") },
      { title: "Dune", author: "Frank Herbert", isbn13: "9780593099322", language: "English", publisher: "Ace", publicationYear: 2019, firstPublishedYear: 1965, genre: "Sci-Fi,Fiction", coverUrl: coverById(13186889), source: "manual", workId: wid("Dune", "Frank Herbert") },
      // Kafka on the Shore
      { title: "Kafka on the Shore", author: "Haruki Murakami", isbn13: "9781400079278", isbn10: "1400079276", language: "English", originalLanguage: "Japanese", publisher: "Vintage", publicationYear: 2005, firstPublishedYear: 2002, genre: "Fiction", coverUrl: cover("9781400079278"), source: "manual", verified: true, workId: wid("Kafka on the Shore", "Haruki Murakami") },
      { title: "海辺のカフカ", author: "村上春樹", titleRomanized: "Umibe no Kafuka", isbn13: "9784101001616", language: "Japanese", script: "Japanese (Kanji 漢字)", publisher: "Shinchosha", publicationYear: 2005, firstPublishedYear: 2002, genre: "Fiction", coverUrl: coverById(8471060), source: "manual", workId: wid("Kafka on the Shore", "Haruki Murakami") },
      // The Stranger
      { title: "The Stranger", author: "Albert Camus", isbn13: "9780679720201", isbn10: "0679720200", language: "English", originalLanguage: "French", publisher: "Vintage", publicationYear: 1989, firstPublishedYear: 1942, genre: "Fiction,Philosophy", coverUrl: cover("9780679720201"), source: "manual", verified: true, workId: wid("The Stranger", "Albert Camus") },
      { title: "L'Étranger", author: "Albert Camus", isbn13: "9782070360024", language: "French", countryOfOrigin: "France", publisher: "Gallimard", publicationYear: 1971, firstPublishedYear: 1942, genre: "Fiction,Philosophy", coverUrl: coverById(8408558), source: "manual", verified: true, workId: wid("The Stranger", "Albert Camus") },
      // Norwegian Wood
      { title: "Norwegian Wood", author: "Haruki Murakami", isbn13: "9780375704024", isbn10: "0375704027", language: "English", originalLanguage: "Japanese", publisher: "Vintage", publicationYear: 2000, firstPublishedYear: 1987, genre: "Fiction", coverUrl: cover("9780375704024"), source: "manual", verified: true, workId: wid("Norwegian Wood", "Haruki Murakami") },
      { title: "ノルウェイの森", author: "村上春樹", titleRomanized: "Noruwei no mori", isbn13: "9784062749497", language: "Japanese", script: "Japanese (Kanji 漢字)", publisher: "Kodansha", publicationYear: 2004, firstPublishedYear: 1987, genre: "Fiction", source: "manual", workId: wid("Norwegian Wood", "Haruki Murakami") },
      // House of Leaves
      { title: "House of Leaves", author: "Mark Z. Danielewski", isbn13: "9780375703768", isbn10: "0375703764", language: "English", publisher: "Pantheon", publicationYear: 2000, firstPublishedYear: 2000, genre: "Fiction,Horror", coverUrl: cover("9780375703768"), source: "manual", verified: true, workId: wid("House of Leaves", "Mark Z. Danielewski") },
      // The Brothers Karamazov
      { title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", isbn13: "9780374528379", isbn10: "0374528373", language: "English", originalLanguage: "Russian", publisher: "Farrar, Straus and Giroux", publicationYear: 2002, firstPublishedYear: 1880, genre: "Fiction", coverUrl: cover("9780374528379"), source: "manual", verified: true, workId: wid("The Brothers Karamazov", "Fyodor Dostoevsky") },
      { title: "Братья Карамазовы", author: "Фёдор Достоевский", titleRomanized: "Bratya Karamazovy", isbn13: "9785699015832", language: "Russian", countryOfOrigin: "Russia", script: "Cyrillic", publisher: "Eksmo", publicationYear: 2008, firstPublishedYear: 1880, genre: "Fiction", coverUrl: coverById(8409928), source: "manual", workId: wid("The Brothers Karamazov", "Fyodor Dostoevsky") },
      { title: "Die Brüder Karamasow", author: "Fjodor Dostojewski", isbn13: "9783423124782", language: "German", originalLanguage: "Russian", publisher: "dtv", publicationYear: 1993, firstPublishedYear: 1880, genre: "Fiction", source: "manual", workId: wid("The Brothers Karamazov", "Fyodor Dostoevsky") },
      // The Master and Margarita
      { title: "The Master and Margarita", author: "Mikhail Bulgakov", isbn13: "9780141180144", isbn10: "0141180145", language: "English", originalLanguage: "Russian", publisher: "Penguin Classics", publicationYear: 1997, firstPublishedYear: 1967, genre: "Fiction,Fantasy", coverUrl: cover("9780141180144"), source: "manual", verified: true, workId: wid("The Master and Margarita", "Mikhail Bulgakov") },
      { title: "Мастер и Маргарита", author: "Михаил Булгаков", titleRomanized: "Master i Margarita", isbn13: "9785170977871", language: "Russian", countryOfOrigin: "USSR / Soviet Union", script: "Cyrillic", publisher: "AST", publicationYear: 2019, firstPublishedYear: 1967, genre: "Fiction,Fantasy", coverUrl: cover("9785170977871"), source: "manual", verified: true, workId: wid("The Master and Margarita", "Mikhail Bulgakov") },
      // Roadside Picnic / Stalker
      { title: "Roadside Picnic", author: "Arkady and Boris Strugatsky", isbn13: "9781613743416", language: "English", originalLanguage: "Russian", publisher: "Chicago Review Press", publicationYear: 2012, firstPublishedYear: 1972, genre: "Sci-Fi", coverUrl: coverById(8443792), source: "manual", verified: true, workId: wid("Roadside Picnic", "Arkady and Boris Strugatsky") },
      { title: "Пикник на обочине", author: "Аркадий и Борис Стругацкие", titleRomanized: "Piknik na obochine", language: "Russian", countryOfOrigin: "USSR / Soviet Union", script: "Cyrillic", publisher: "Молодая гвардия", publicationYear: 1972, firstPublishedYear: 1972, genre: "Sci-Fi", source: "manual", verified: true, workId: wid("Roadside Picnic", "Arkady and Boris Strugatsky") },
      // Crime and Punishment
      { title: "Crime and Punishment", author: "Fyodor Dostoevsky", isbn13: "9780143058144", language: "English", originalLanguage: "Russian", publisher: "Penguin Classics", publicationYear: 2003, firstPublishedYear: 1866, genre: "Fiction", coverUrl: coverById(8479260), source: "manual", verified: true, workId: wid("Crime and Punishment", "Fyodor Dostoevsky") },
      { title: "Преступление и наказание", author: "Фёдор Достоевский", titleRomanized: "Prestupleniye i nakazaniye", language: "Russian", countryOfOrigin: "Russian Empire", script: "Cyrillic", publisher: "Eksmo", publicationYear: 2005, firstPublishedYear: 1866, genre: "Fiction", source: "manual", workId: wid("Crime and Punishment", "Fyodor Dostoevsky") },
      // War and Peace
      { title: "War and Peace", author: "Leo Tolstoy", isbn13: "9780140447934", language: "English", originalLanguage: "Russian", publisher: "Penguin Classics", publicationYear: 1982, firstPublishedYear: 1869, genre: "Fiction,History", coverUrl: coverById(8228691), source: "manual", verified: true, workId: wid("War and Peace", "Leo Tolstoy") },
      { title: "Война и мир", author: "Лев Толстой", titleRomanized: "Voyna i mir", language: "Russian", countryOfOrigin: "Russian Empire", script: "Cyrillic", publisher: "Азбука", publicationYear: 2012, firstPublishedYear: 1869, genre: "Fiction,History", source: "manual", workId: wid("War and Peace", "Leo Tolstoy") },
      // Bridge on the Drina
      { title: "The Bridge on the Drina", author: "Ivo Andrić", isbn13: "9780226020457", isbn10: "0226020452", language: "English", originalLanguage: "Serbian", publisher: "University of Chicago Press", publicationYear: 1977, firstPublishedYear: 1945, genre: "Fiction,History", coverUrl: cover("9780226020457"), source: "manual", verified: true, workId: wid("The Bridge on the Drina", "Ivo Andrić") },
      { title: "Na Drini ćuprija", author: "Ivo Andrić", isbn13: "9788652118038", language: "Serbian", countryOfOrigin: "Yugoslavia", script: "Cyrillic", publisher: "Prosveta", publicationYear: 1945, firstPublishedYear: 1945, genre: "Fiction,History", coverUrl: cover("9788652118038"), source: "manual", verified: true, workId: wid("The Bridge on the Drina", "Ivo Andrić") },
      { title: "Die Brücke über die Drina", author: "Ivo Andrić", language: "German", originalLanguage: "Serbian", publisher: "Paul Zsolnay Verlag", publicationYear: 1953, firstPublishedYear: 1945, genre: "Fiction,History", source: "manual", workId: wid("The Bridge on the Drina", "Ivo Andrić") },
      // Death and the Dervish
      { title: "Death and the Dervish", author: "Meša Selimović", isbn13: "9780810112384", language: "English", originalLanguage: "Bosnian", publisher: "Northwestern University Press", publicationYear: 1996, firstPublishedYear: 1966, genre: "Fiction,Philosophy", coverUrl: coverById(13127483), source: "manual", verified: true, workId: wid("Death and the Dervish", "Meša Selimović") },
      { title: "Derviš i smrt", author: "Meša Selimović", language: "Bosnian", countryOfOrigin: "Yugoslavia", script: "Latin", publisher: "Svjetlost", publicationYear: 1966, firstPublishedYear: 1966, genre: "Fiction,Philosophy", source: "manual", verified: true, workId: wid("Death and the Dervish", "Meša Selimović") },
      // The Damned Yard
      { title: "The Damned Yard", author: "Ivo Andrić", language: "English", originalLanguage: "Serbian", publisher: "Forest Books", publicationYear: 1992, firstPublishedYear: 1954, genre: "Fiction", source: "manual", verified: true, workId: wid("The Damned Yard", "Ivo Andrić") },
      { title: "Prokleta avlija", author: "Ivo Andrić", language: "Serbian", countryOfOrigin: "Yugoslavia", script: "Cyrillic", publisher: "Prosveta", publicationYear: 1954, firstPublishedYear: 1954, genre: "Fiction", source: "manual", verified: true, workId: wid("The Damned Yard", "Ivo Andrić") },
      // A Brief History of Time
      { title: "A Brief History of Time", author: "Stephen Hawking", isbn13: "9780553380163", isbn10: "0553380168", language: "English", publisher: "Bantam", publicationYear: 1988, firstPublishedYear: 1988, genre: "Non-Fiction,Science", coverUrl: cover("9780553380163"), source: "manual", verified: true, workId: wid("A Brief History of Time", "Stephen Hawking") },
      { title: "A Brief History of Time (Updated Edition)", author: "Stephen Hawking", isbn13: "9780553804577", language: "English", publisher: "Bantam", publicationYear: 1998, firstPublishedYear: 1988, genre: "Non-Fiction,Science", coverUrl: cover("9780553804577"), source: "manual", verified: true, workId: wid("A Brief History of Time", "Stephen Hawking") },
      // 1984
      { title: "1984", author: "George Orwell", isbn13: "9780451524935", isbn10: "0451524934", language: "English", publisher: "Signet Classics", publicationYear: 1950, firstPublishedYear: 1949, genre: "Fiction,Sci-Fi", coverUrl: cover("9780451524935"), source: "manual", verified: true, workId: wid("1984", "George Orwell") },
      { title: "Nineteen Eighty-Four", author: "George Orwell", isbn13: "9780141036144", language: "English", publisher: "Penguin Modern Classics", publicationYear: 2004, firstPublishedYear: 1949, genre: "Fiction,Sci-Fi", coverUrl: cover("9780141036144"), source: "manual", verified: true, workId: wid("1984", "George Orwell") },
      // The Left Hand of Darkness
      { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn13: "9780441478125", isbn10: "0441478123", language: "English", publisher: "Ace", publicationYear: 1969, firstPublishedYear: 1969, genre: "Sci-Fi", coverUrl: cover("9780441478125"), source: "manual", verified: true, workId: wid("The Left Hand of Darkness", "Ursula K. Le Guin") },
      // Kafka's Diaries
      { title: "The Diaries of Franz Kafka", author: "Franz Kafka", isbn13: "9780805209068", isbn10: "0805209069", language: "English", originalLanguage: "German", publisher: "Schocken", publicationYear: 1988, firstPublishedYear: 1948, genre: "Non-Fiction,Biography", coverUrl: cover("9780805209068"), source: "manual", verified: true, workId: wid("The Diaries of Franz Kafka", "Franz Kafka") },
      { title: "Tagebücher", author: "Franz Kafka", language: "German", countryOfOrigin: "Austria-Hungary", script: "Latin", publisher: "S. Fischer Verlag", publicationYear: 1954, firstPublishedYear: 1948, genre: "Non-Fiction,Biography", source: "manual", verified: true, workId: wid("The Diaries of Franz Kafka", "Franz Kafka") },
      // One Hundred Years of Solitude
      { title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", isbn13: "9780060883287", isbn10: "0060883286", language: "English", originalLanguage: "Spanish", publisher: "Harper Perennial Modern Classics", publicationYear: 2006, firstPublishedYear: 1967, genre: "Fiction", coverUrl: coverById(8411716), source: "manual", verified: true, workId: wid("One Hundred Years of Solitude", "Gabriel García Márquez") },
      { title: "Cien años de soledad", author: "Gabriel García Márquez", isbn13: "9788497592208", language: "Spanish", countryOfOrigin: "Colombia", publisher: "Cátedra", publicationYear: 2007, firstPublishedYear: 1967, genre: "Fiction", source: "manual", verified: true, workId: wid("One Hundred Years of Solitude", "Gabriel García Márquez") },
      // Don Quixote
      { title: "Don Quixote", author: "Miguel de Cervantes", isbn13: "9780060934347", language: "English", originalLanguage: "Spanish", publisher: "Harper Perennial Modern Classics", publicationYear: 2003, firstPublishedYear: 1605, genre: "Fiction", coverUrl: coverById(8416816), source: "manual", verified: true, workId: wid("Don Quixote", "Miguel de Cervantes") },
      { title: "El ingenioso hidalgo don Quijote de la Mancha", author: "Miguel de Cervantes", language: "Spanish", countryOfOrigin: "Spain", publisher: "Real Academia Española", publicationYear: 2004, firstPublishedYear: 1605, genre: "Fiction", source: "manual", verified: true, workId: wid("Don Quixote", "Miguel de Cervantes") },
      // Things Fall Apart
      { title: "Things Fall Apart", author: "Chinua Achebe", isbn13: "9780385474542", isbn10: "0385474547", language: "English", countryOfOrigin: "Nigeria", publisher: "Anchor", publicationYear: 1994, firstPublishedYear: 1958, genre: "Fiction", coverUrl: coverById(8468612), source: "manual", verified: true, workId: wid("Things Fall Apart", "Chinua Achebe") },
      // The Divine Comedy
      { title: "The Divine Comedy", author: "Dante Alighieri", isbn13: "9780142437223", language: "English", originalLanguage: "Italian", publisher: "Penguin Classics", publicationYear: 2003, firstPublishedYear: 1320, genre: "Poetry,Fiction", coverUrl: coverById(8470260), source: "manual", verified: true, workId: wid("The Divine Comedy", "Dante Alighieri") },
      { title: "La Divina Commedia", author: "Dante Alighieri", language: "Italian", countryOfOrigin: "Italy", publisher: "Einaudi", publicationYear: 2014, firstPublishedYear: 1320, genre: "Poetry,Fiction", source: "manual", verified: true, workId: wid("The Divine Comedy", "Dante Alighieri") },
      // Hamlet
      { title: "Hamlet", author: "William Shakespeare", isbn13: "9780743477123", isbn10: "0743477124", language: "English", publisher: "Simon & Schuster", publicationYear: 2003, firstPublishedYear: 1603, genre: "Fiction,Drama", coverUrl: coverById(8471820), source: "manual", verified: true, workId: wid("Hamlet", "William Shakespeare") },
      ]);
    }

    const [{ count: catalogTotal }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);
    console.log(`Seeded ${allWorksRows.length} works and ${catalogTotal} catalog entries.`);
  }

  // For existing installs we're done
  if (skipUsers) {
    await pool.end();
    return;
  }

  // ═══════════════════════════════════════
  // ADMIN USER — SHA-256 derived password
  // ═══════════════════════════════════════
  const adminUsername = process.env.ADMIN_USERNAME || crypto.randomBytes(4).toString("hex");
  const adminEmail = process.env.ADMIN_EMAIL || `${adminUsername}@unshelvd.com`;
  let adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(12).toString("base64url").slice(0, 16) + "!A1";
  }

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  ADMIN CREDENTIALS — SAVE THESE IMMEDIATELY!         ║");
  console.log("║  These will NOT be shown again.                      ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  console.log(`║  Username: ${adminUsername.padEnd(40)}║`);
  console.log(`║  Email:    ${adminEmail.padEnd(40)}║`);
  console.log(`║  Password: ${adminPassword.padEnd(40)}║`);
  console.log(`║  SHA-256:  ${crypto.createHash("sha256").update(adminPassword).digest("hex").slice(0, 38)}..║`);
  console.log("╚══════════════════════════════════════════════════════╝");

  const adminHash = await bcrypt.hash(adminPassword, 12);

  await db.insert(users).values({
    username: adminUsername,
    displayName: "Unshelv'd Admin",
    email: adminEmail,
    password: adminHash,
    bio: "Platform administrator.",
    location: "Battle Creek, MI",
    role: "admin",
  });

  // ═══════════════════════════════════════
  // DEMO USERS
  // ═══════════════════════════════════════
  const demoHash = await bcrypt.hash("DemoPassword!234", 12);

  const [jane] = await db.insert(users).values({
    username: "bookworm",
    displayName: "Jane Reader",
    email: "jane@example.com",
    password: demoHash,
    bio: "Avid reader and collector. Always looking for rare first editions.",
    location: "Portland, OR",
  }).returning();

  const [alex] = await db.insert(users).values({
    username: "alexshelves",
    displayName: "Alex Shelves",
    email: "alex@example.com",
    password: demoHash,
    bio: "Philosophy and sci-fi enthusiast. My shelves are overflowing.",
    location: "Austin, TX",
  }).returning();

  const [mirko] = await db.insert(users).values({
    username: "mirko_knjige",
    displayName: "Mirko Petrović",
    email: "mirko@example.com",
    password: demoHash,
    bio: "Collector of Yugoslav, Soviet, and Eastern European literature. Originals only, no reprints.",
    location: "Belgrade, Serbia",
  }).returning();

  // Rebuild workMap in case catalog was already seeded before users (re-query if needed)
  if (workMap.size === 0) {
    const allWorks = await db.select().from(works);
    for (const w of allWorks) workMap.set(`${w.title}|${w.author}`, w.id);
  }
  const wid2 = (title: string, author: string) => workMap.get(`${title}|${author}`) ?? null;

  // ═══════════════════════════════════════
  // JANE'S BOOKS
  // ═══════════════════════════════════════
  await db.insert(books).values([
    { userId: jane.id, title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn: "9780062316097", coverUrl: cover("9780062316097"), condition: "like-new", status: "for-sale", price: 15.99, genre: "Non-Fiction,History", publisher: "Harper", edition: "1st", year: 2015, workId: wid2("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
    { userId: jane.id, title: "Meditations", author: "Marcus Aurelius", isbn: "9780140449334", coverUrl: cover("9780140449334"), condition: "fair", status: "for-sale", price: 12.00, genre: "Philosophy", publisher: "Penguin Classics", workId: wid2("Meditations", "Marcus Aurelius") },
    { userId: jane.id, title: "Blood Meridian", author: "Cormac McCarthy", isbn: "9780679728757", coverUrl: cover("9780679728757"), condition: "good", status: "for-sale", price: 24.99, genre: "Fiction", publisher: "Vintage", year: 1985, workId: wid2("Blood Meridian", "Cormac McCarthy") },
    { userId: jane.id, title: "Dune", author: "Frank Herbert", isbn: "9780441172719", coverUrl: cover("9780441172719"), condition: "good", status: "for-sale", price: 18.50, genre: "Sci-Fi", publisher: "Ace", year: 1965, workId: wid2("Dune", "Frank Herbert") },
    { userId: jane.id, title: "Kafka on the Shore", author: "Haruki Murakami", isbn: "9781400079278", coverUrl: cover("9781400079278"), condition: "like-new", status: "open-to-offers", genre: "Fiction", publisher: "Vintage", year: 2005, workId: wid2("Kafka on the Shore", "Haruki Murakami") },
    { userId: jane.id, title: "The Stranger", author: "Albert Camus", isbn: "9780679720201", coverUrl: cover("9780679720201"), condition: "good", status: "not-for-sale", genre: "Fiction,Philosophy", publisher: "Vintage", year: 1942, workId: wid2("The Stranger", "Albert Camus") },
    { userId: jane.id, title: "Norwegian Wood", author: "Haruki Murakami", isbn: "9780375704024", coverUrl: cover("9780375704024"), condition: "like-new", status: "reading", genre: "Fiction", publisher: "Vintage", year: 1987, workId: wid2("Norwegian Wood", "Haruki Murakami") },
    { userId: jane.id, title: "House of Leaves", author: "Mark Z. Danielewski", isbn: "9780375703768", coverUrl: cover("9780375703768"), condition: "new", status: "wishlist", genre: "Fiction,Horror", year: 2000, workId: wid2("House of Leaves", "Mark Z. Danielewski") },
  ]);

  // ═══════════════════════════════════════
  // ALEX'S BOOKS
  // ═══════════════════════════════════════
  await db.insert(books).values([
    { userId: alex.id, title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", isbn: "9780374528379", coverUrl: cover("9780374528379"), condition: "fair", status: "for-sale", price: 14.50, genre: "Fiction", publisher: "Farrar, Straus and Giroux", year: 1880, language: "English", originalLanguage: "Russian", countryOfOrigin: "Russian Empire", era: "Antique (Pre-1900)", workId: wid2("The Brothers Karamazov", "Fyodor Dostoevsky") },
    { userId: alex.id, title: "A Brief History of Time", author: "Stephen Hawking", isbn: "9780553380163", coverUrl: cover("9780553380163"), condition: "new", status: "for-sale", price: 22.00, genre: "Non-Fiction,Science", publisher: "Bantam", year: 1988, language: "English", countryOfOrigin: "United Kingdom", era: "Modern (1970-2000)", workId: wid2("A Brief History of Time", "Stephen Hawking") },
    { userId: alex.id, title: "1984", author: "George Orwell", isbn: "9780451524935", coverUrl: cover("9780451524935"), condition: "good", status: "for-sale", price: 9.99, genre: "Fiction,Sci-Fi", publisher: "Signet Classics", year: 1949, language: "English", countryOfOrigin: "United Kingdom", era: "Vintage (1900-1970)", workId: wid2("1984", "George Orwell") },
    { userId: alex.id, title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn: "9780441478125", coverUrl: cover("9780441478125"), condition: "good", status: "open-to-offers", genre: "Sci-Fi", publisher: "Ace", year: 1969, language: "English", countryOfOrigin: "United States", era: "Vintage (1900-1970)", workId: wid2("The Left Hand of Darkness", "Ursula K. Le Guin") },
  ]);

  // ═══════════════════════════════════════
  // MIRKO'S INTERNATIONAL COLLECTION
  // ═══════════════════════════════════════
  await db.insert(books).values([
    { userId: mirko.id, title: "Na Drini ćuprija", author: "Ivo Andrić", isbn: "9788652118038", coverUrl: cover("9788652118038"), condition: "good", status: "for-sale", price: 35.00, genre: "Fiction,History", publisher: "Prosveta", year: 1945, language: "Serbian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Cyrillic", workId: wid2("The Bridge on the Drina", "Ivo Andrić") },
    { userId: mirko.id, title: "The Bridge on the Drina", author: "Ivo Andrić", isbn: "9780226020457", coverUrl: cover("9780226020457"), condition: "like-new", status: "for-sale", price: 18.00, genre: "Fiction,History", publisher: "University of Chicago Press", year: 1959, language: "English", originalLanguage: "Serbian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Latin", workId: wid2("The Bridge on the Drina", "Ivo Andrić") },
    { userId: mirko.id, title: "Мастер и Маргарита", author: "Михаил Булгаков", isbn: "9785170977871", coverUrl: cover("9785170977871"), condition: "fair", status: "open-to-offers", genre: "Fiction,Fantasy", publisher: "AST", year: 1967, language: "Russian", countryOfOrigin: "USSR / Soviet Union", era: "Vintage (1900-1970)", script: "Cyrillic", workId: wid2("The Master and Margarita", "Mikhail Bulgakov") },
    { userId: mirko.id, title: "The Master and Margarita", author: "Mikhail Bulgakov", isbn: "9780141180144", coverUrl: cover("9780141180144"), condition: "good", status: "for-sale", price: 14.00, genre: "Fiction,Fantasy", publisher: "Penguin Classics", year: 1997, language: "English", originalLanguage: "Russian", countryOfOrigin: "USSR / Soviet Union", era: "Vintage (1900-1970)", script: "Latin", workId: wid2("The Master and Margarita", "Mikhail Bulgakov") },
    { userId: mirko.id, title: "Derviš i smrt", author: "Meša Selimović", condition: "good", status: "for-sale", price: 28.00, genre: "Fiction,Philosophy", publisher: "Svjetlost", year: 1966, language: "Bosnian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Latin", workId: wid2("Death and the Dervish", "Meša Selimović") },
    { userId: mirko.id, title: "Сталкер (Strugatsky brothers)", author: "Аркадий и Борис Стругацкие", condition: "fair", status: "open-to-offers", genre: "Sci-Fi", publisher: "Молодая гвардия", year: 1972, language: "Russian", countryOfOrigin: "USSR / Soviet Union", era: "Modern (1970-2000)", script: "Cyrillic", workId: wid2("Roadside Picnic", "Arkady and Boris Strugatsky") },
    { userId: mirko.id, title: "Kafka's Diaries", author: "Franz Kafka", isbn: "9780805209068", coverUrl: cover("9780805209068"), condition: "good", status: "not-for-sale", genre: "Non-Fiction,Biography", publisher: "Schocken", year: 1948, language: "English", originalLanguage: "German", countryOfOrigin: "Austria-Hungary", era: "Vintage (1900-1970)", script: "Latin", workId: wid2("The Diaries of Franz Kafka", "Franz Kafka") },
    { userId: mirko.id, title: "Prokleta avlija", author: "Ivo Andrić", condition: "fair", status: "for-sale", price: 22.00, genre: "Fiction", publisher: "Prosveta", year: 1954, language: "Serbian", countryOfOrigin: "Yugoslavia", era: "Vintage (1900-1970)", script: "Cyrillic", workId: wid2("The Damned Yard", "Ivo Andrić") },
  ]);

  // ═══════════════════════════════════════
  // BOOK REQUESTS
  // ═══════════════════════════════════════
  await db.insert(bookRequests).values([
    { userId: alex.id, title: "Gravity's Rainbow", author: "Thomas Pynchon", description: "Penguin Classics edition or original Viking Press.", maxPrice: 45, edition: "Penguin Classics" },
    { userId: jane.id, title: "The Wind-Up Bird Chronicle", author: "Haruki Murakami", description: "Any edition in good condition. Hardcover preferred.", maxPrice: 30 },
    { userId: alex.id, title: "Infinite Jest", author: "David Foster Wallace", description: "Looking for a clean first edition, preferably with dust jacket intact.", maxPrice: 150, edition: "First Edition" },
    { userId: mirko.id, title: "Travnička hronika", author: "Ivo Andrić", description: "Original Yugoslav edition from Prosveta or Srpska književna zadruga. Cyrillic preferred.", maxPrice: 60, language: "Serbian", countryOfOrigin: "Yugoslavia" },
    { userId: mirko.id, title: "We", author: "Yevgeny Zamyatin", description: "Looking for an original Russian edition (Мы). Any Soviet-era print.", maxPrice: 100, language: "Russian", countryOfOrigin: "USSR / Soviet Union" },
  ]);

  console.log("Seed complete: 1 admin + 3 demo users, 20 books, 5 requests, 25 works, 50+ catalog entries.");
  await pool.end();
}

seed().catch(console.error);
