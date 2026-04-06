/**
 * Auto-Seed — runs at server startup to ensure the works and catalog
 * tables have initial data.  Safe to run on every startup because it
 * checks counts first and exits immediately when data already exists.
 *
 * Does NOT seed users/books/requests — use `npm run db:seed` for that.
 */

import { db } from "./storage";
import { works, bookCatalog } from "@shared/schema";
import { sql } from "drizzle-orm";

const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
const coverById = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

export async function runAutoSeed(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  try {
    const [{ count: wCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(works);
    const [{ count: cCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookCatalog);

    if (wCount > 0 && cCount > 0) return; // Already seeded

    console.log("[seed] Auto-seeding works and catalog tables…");

    // Works definitions (used for both insertion and catalog linking)
    const worksValues = [
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", originalLanguage: "Hebrew", firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: cover("9780062316097"), source: "manual", verified: true },
      { title: "Meditations", author: "Marcus Aurelius", originalLanguage: "Ancient Greek", firstPublishedYear: 180, genre: "Philosophy", coverUrl: cover("9780140449334"), source: "manual", verified: true },
      { title: "Blood Meridian", author: "Cormac McCarthy", originalLanguage: "English", firstPublishedYear: 1985, genre: "Fiction", coverUrl: cover("9780679728757"), source: "manual", verified: true },
      { title: "Dune", author: "Frank Herbert", originalLanguage: "English", firstPublishedYear: 1965, genre: "Sci-Fi,Fiction", coverUrl: cover("9780441172719"), source: "manual", verified: true },
      { title: "Kafka on the Shore", author: "Haruki Murakami", originalLanguage: "Japanese", firstPublishedYear: 2002, genre: "Fiction", coverUrl: cover("9781400079278"), source: "manual", verified: true },
      { title: "The Stranger", author: "Albert Camus", titleOriginal: "L'Étranger", originalLanguage: "French", firstPublishedYear: 1942, genre: "Fiction,Philosophy", coverUrl: cover("9780679720201"), source: "manual", verified: true },
      { title: "Norwegian Wood", author: "Haruki Murakami", titleOriginalScript: "ノルウェイの森", originalLanguage: "Japanese", firstPublishedYear: 1987, genre: "Fiction", coverUrl: cover("9780375704024"), source: "manual", verified: true },
      { title: "House of Leaves", author: "Mark Z. Danielewski", originalLanguage: "English", firstPublishedYear: 2000, genre: "Fiction,Horror", coverUrl: cover("9780375703768"), source: "manual", verified: true },
      { title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", titleOriginal: "Братья Карамазовы", originalLanguage: "Russian", firstPublishedYear: 1880, genre: "Fiction", coverUrl: cover("9780374528379"), source: "manual", verified: true },
      { title: "The Master and Margarita", author: "Mikhail Bulgakov", titleOriginal: "Мастер и Маргарита", titleOriginalScript: "Мастер и Маргарита", originalLanguage: "Russian", firstPublishedYear: 1967, genre: "Fiction,Fantasy", coverUrl: cover("9780141180144"), source: "manual", verified: true },
      { title: "Roadside Picnic", author: "Arkady and Boris Strugatsky", titleOriginal: "Пикник на обочине", originalLanguage: "Russian", firstPublishedYear: 1972, genre: "Sci-Fi", coverUrl: coverById(8443792), source: "manual", verified: true },
      { title: "Crime and Punishment", author: "Fyodor Dostoevsky", titleOriginal: "Преступление и наказание", originalLanguage: "Russian", firstPublishedYear: 1866, genre: "Fiction", coverUrl: coverById(8479260), source: "manual", verified: true },
      { title: "War and Peace", author: "Leo Tolstoy", titleOriginal: "Война и мир", titleOriginalScript: "Война и мир", originalLanguage: "Russian", firstPublishedYear: 1869, genre: "Fiction,History", coverUrl: coverById(8228691), source: "manual", verified: true },
      { title: "The Bridge on the Drina", author: "Ivo Andrić", titleOriginal: "Na Drini ćuprija", originalLanguage: "Serbian", firstPublishedYear: 1945, genre: "Fiction,History", coverUrl: cover("9780226020457"), source: "manual", verified: true },
      { title: "Death and the Dervish", author: "Meša Selimović", titleOriginal: "Derviš i smrt", originalLanguage: "Bosnian", firstPublishedYear: 1966, genre: "Fiction,Philosophy", coverUrl: coverById(13127483), source: "manual", verified: true },
      { title: "The Damned Yard", author: "Ivo Andrić", titleOriginal: "Prokleta avlija", originalLanguage: "Serbian", firstPublishedYear: 1954, genre: "Fiction", coverUrl: coverById(8394082), source: "manual", verified: true },
      { title: "A Brief History of Time", author: "Stephen Hawking", originalLanguage: "English", firstPublishedYear: 1988, genre: "Non-Fiction,Science", coverUrl: cover("9780553380163"), source: "manual", verified: true },
      { title: "1984", author: "George Orwell", titleOriginal: "Nineteen Eighty-Four", originalLanguage: "English", firstPublishedYear: 1949, genre: "Fiction,Sci-Fi", coverUrl: cover("9780451524935"), source: "manual", verified: true },
      { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", originalLanguage: "English", firstPublishedYear: 1969, genre: "Sci-Fi", coverUrl: cover("9780441478125"), source: "manual", verified: true },
      { title: "The Diaries of Franz Kafka", author: "Franz Kafka", titleOriginal: "Tagebücher", originalLanguage: "German", firstPublishedYear: 1948, genre: "Non-Fiction,Biography", coverUrl: cover("9780805209068"), source: "manual", verified: true },
      { title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", titleOriginal: "Cien años de soledad", originalLanguage: "Spanish", firstPublishedYear: 1967, genre: "Fiction", coverUrl: coverById(8411716), source: "manual", verified: true },
      { title: "Don Quixote", author: "Miguel de Cervantes", titleOriginal: "El ingenioso hidalgo don Quijote de la Mancha", originalLanguage: "Spanish", firstPublishedYear: 1605, genre: "Fiction", coverUrl: coverById(8416816), source: "manual", verified: true },
      { title: "Things Fall Apart", author: "Chinua Achebe", originalLanguage: "English", firstPublishedYear: 1958, genre: "Fiction", coverUrl: coverById(8468612), source: "manual", verified: true },
      { title: "The Divine Comedy", author: "Dante Alighieri", titleOriginal: "Divina Commedia", originalLanguage: "Italian", firstPublishedYear: 1320, genre: "Poetry,Fiction", coverUrl: coverById(8470260), source: "manual", verified: true },
      { title: "Hamlet", author: "William Shakespeare", originalLanguage: "English", firstPublishedYear: 1603, genre: "Fiction,Drama", coverUrl: coverById(8471820), source: "manual", verified: true },
    ] as const;

    // Insert works only if table is empty; otherwise re-use existing rows
    let allWorks: { id: number; title: string; author: string }[];
    if (wCount === 0) {
      allWorks = await db.insert(works).values(worksValues as any).returning();
    } else {
      allWorks = await db.select({ id: works.id, title: works.title, author: works.author }).from(works);
    }

    const wid = (title: string, author: string): number | null => {
      const w = allWorks.find((x) => x.title === title && x.author === author);
      return w?.id ?? null;
    };

    if (cCount === 0) {
      await db.insert(bookCatalog).values([
      // Sapiens
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn13: "9780062316097", isbn10: "0062316095", language: "English", publisher: "Harper", publicationYear: 2015, firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: cover("9780062316097"), source: "manual", verified: true, workId: wid("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
      { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn13: "9780099590088", language: "English", publisher: "Vintage", publicationYear: 2015, firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: cover("9780099590088"), source: "manual", verified: true, workId: wid("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
      { title: "קיצור תולדות האנושות", author: "יובל נח הררי", titleRomanized: "Kitsur Toldot HaEnoshut", isbn13: "9789655601695", language: "Hebrew", countryOfOrigin: "Israel", script: "Hebrew (עברית)", textDirection: "rtl", publisher: "Dvir", publicationYear: 2011, firstPublishedYear: 2011, genre: "Non-Fiction,History", coverUrl: coverById(7781014), source: "manual", verified: true, workId: wid("Sapiens: A Brief History of Humankind", "Yuval Noah Harari") },
      // Meditations
      { title: "Meditations", author: "Marcus Aurelius", isbn13: "9780140449334", isbn10: "0140449337", language: "English", originalLanguage: "Ancient Greek", publisher: "Penguin Classics", publicationYear: 2006, firstPublishedYear: 180, genre: "Philosophy", coverUrl: cover("9780140449334"), source: "manual", verified: true, workId: wid("Meditations", "Marcus Aurelius") },
      { title: "Meditations", author: "Marcus Aurelius", isbn13: "9780486298238", language: "English", publisher: "Dover", publicationYear: 1997, firstPublishedYear: 180, genre: "Philosophy", coverUrl: cover("9780486298238"), source: "manual", verified: true, workId: wid("Meditations", "Marcus Aurelius") },
      { title: "Τὰ εἰς ἑαυτόν", author: "Μάρκος Αὐρήλιος", titleRomanized: "Ta eis heauton", language: "Ancient Greek", script: "Greek", publisher: "Akademische Verlagsgesellschaft", publicationYear: 1960, firstPublishedYear: 180, genre: "Philosophy", source: "manual", verified: true, workId: wid("Meditations", "Marcus Aurelius") },
      // Blood Meridian
      { title: "Blood Meridian, or the Evening Redness in the West", author: "Cormac McCarthy", isbn13: "9780679728757", isbn10: "0679728759", language: "English", publisher: "Vintage", publicationYear: 1992, firstPublishedYear: 1985, genre: "Fiction", coverUrl: cover("9780679728757"), source: "manual", verified: true, workId: wid("Blood Meridian", "Cormac McCarthy") },
      // Dune
      { title: "Dune", author: "Frank Herbert", isbn13: "9780441172719", isbn10: "0441172717", language: "English", publisher: "Ace", publicationYear: 1990, firstPublishedYear: 1965, genre: "Sci-Fi,Fiction", coverUrl: cover("9780441172719"), source: "manual", verified: true, workId: wid("Dune", "Frank Herbert") },
      { title: "Dune", author: "Frank Herbert", isbn13: "9780593099322", language: "English", publisher: "Ace", publicationYear: 2019, firstPublishedYear: 1965, genre: "Sci-Fi,Fiction", coverUrl: coverById(13186889), source: "manual", verified: true, workId: wid("Dune", "Frank Herbert") },
      // Kafka on the Shore
      { title: "Kafka on the Shore", author: "Haruki Murakami", isbn13: "9781400079278", isbn10: "1400079276", language: "English", originalLanguage: "Japanese", publisher: "Vintage", publicationYear: 2005, firstPublishedYear: 2002, genre: "Fiction", coverUrl: cover("9781400079278"), source: "manual", verified: true, workId: wid("Kafka on the Shore", "Haruki Murakami") },
      { title: "海辺のカフカ", author: "村上春樹", titleRomanized: "Umibe no Kafuka", isbn13: "9784101001616", language: "Japanese", script: "Japanese (Kanji 漢字)", publisher: "Shinchosha", publicationYear: 2005, firstPublishedYear: 2002, genre: "Fiction", coverUrl: coverById(8471060), source: "manual", verified: true, workId: wid("Kafka on the Shore", "Haruki Murakami") },
      // The Stranger
      { title: "The Stranger", author: "Albert Camus", isbn13: "9780679720201", isbn10: "0679720200", language: "English", originalLanguage: "French", publisher: "Vintage", publicationYear: 1989, firstPublishedYear: 1942, genre: "Fiction,Philosophy", coverUrl: cover("9780679720201"), source: "manual", verified: true, workId: wid("The Stranger", "Albert Camus") },
      { title: "L'Étranger", author: "Albert Camus", isbn13: "9782070360024", language: "French", countryOfOrigin: "France", publisher: "Gallimard", publicationYear: 1971, firstPublishedYear: 1942, genre: "Fiction,Philosophy", coverUrl: coverById(8408558), source: "manual", verified: true, workId: wid("The Stranger", "Albert Camus") },
      // Norwegian Wood
      { title: "Norwegian Wood", author: "Haruki Murakami", isbn13: "9780375704024", isbn10: "0375704027", language: "English", originalLanguage: "Japanese", publisher: "Vintage", publicationYear: 2000, firstPublishedYear: 1987, genre: "Fiction", coverUrl: cover("9780375704024"), source: "manual", verified: true, workId: wid("Norwegian Wood", "Haruki Murakami") },
      { title: "ノルウェイの森", author: "村上春樹", titleRomanized: "Noruwei no mori", isbn13: "9784062749497", language: "Japanese", script: "Japanese (Kanji 漢字)", publisher: "Kodansha", publicationYear: 2004, firstPublishedYear: 1987, genre: "Fiction", source: "manual", verified: true, workId: wid("Norwegian Wood", "Haruki Murakami") },
      // House of Leaves
      { title: "House of Leaves", author: "Mark Z. Danielewski", isbn13: "9780375703768", isbn10: "0375703764", language: "English", publisher: "Pantheon", publicationYear: 2000, firstPublishedYear: 2000, genre: "Fiction,Horror", coverUrl: cover("9780375703768"), source: "manual", verified: true, workId: wid("House of Leaves", "Mark Z. Danielewski") },
      // The Brothers Karamazov
      { title: "The Brothers Karamazov", author: "Fyodor Dostoevsky", isbn13: "9780374528379", isbn10: "0374528373", language: "English", originalLanguage: "Russian", publisher: "Farrar, Straus and Giroux", publicationYear: 2002, firstPublishedYear: 1880, genre: "Fiction", coverUrl: cover("9780374528379"), source: "manual", verified: true, workId: wid("The Brothers Karamazov", "Fyodor Dostoevsky") },
      { title: "Братья Карамазовы", author: "Фёдор Достоевский", titleRomanized: "Bratya Karamazovy", isbn13: "9785699015832", language: "Russian", countryOfOrigin: "Russia", script: "Cyrillic", publisher: "Eksmo", publicationYear: 2008, firstPublishedYear: 1880, genre: "Fiction", coverUrl: coverById(8409928), source: "manual", verified: true, workId: wid("The Brothers Karamazov", "Fyodor Dostoevsky") },
      { title: "Die Brüder Karamasow", author: "Fjodor Dostojewski", isbn13: "9783423124782", language: "German", originalLanguage: "Russian", publisher: "dtv", publicationYear: 1993, firstPublishedYear: 1880, genre: "Fiction", source: "manual", verified: true, workId: wid("The Brothers Karamazov", "Fyodor Dostoevsky") },
      // Master and Margarita
      { title: "The Master and Margarita", author: "Mikhail Bulgakov", isbn13: "9780141180144", isbn10: "0141180145", language: "English", originalLanguage: "Russian", publisher: "Penguin Classics", publicationYear: 1997, firstPublishedYear: 1967, genre: "Fiction,Fantasy", coverUrl: cover("9780141180144"), source: "manual", verified: true, workId: wid("The Master and Margarita", "Mikhail Bulgakov") },
      { title: "Мастер и Маргарита", author: "Михаил Булгаков", titleRomanized: "Master i Margarita", isbn13: "9785170977871", language: "Russian", countryOfOrigin: "USSR / Soviet Union", script: "Cyrillic", publisher: "AST", publicationYear: 2019, firstPublishedYear: 1967, genre: "Fiction,Fantasy", coverUrl: cover("9785170977871"), source: "manual", verified: true, workId: wid("The Master and Margarita", "Mikhail Bulgakov") },
      // Roadside Picnic
      { title: "Roadside Picnic", author: "Arkady and Boris Strugatsky", isbn13: "9781613743416", language: "English", originalLanguage: "Russian", publisher: "Chicago Review Press", publicationYear: 2012, firstPublishedYear: 1972, genre: "Sci-Fi", coverUrl: coverById(8443792), source: "manual", verified: true, workId: wid("Roadside Picnic", "Arkady and Boris Strugatsky") },
      { title: "Пикник на обочине", author: "Аркадий и Борис Стругацкие", titleRomanized: "Piknik na obochine", language: "Russian", countryOfOrigin: "USSR / Soviet Union", script: "Cyrillic", publisher: "Молодая гвардия", publicationYear: 1972, firstPublishedYear: 1972, genre: "Sci-Fi", source: "manual", verified: true, workId: wid("Roadside Picnic", "Arkady and Boris Strugatsky") },
      // Crime and Punishment
      { title: "Crime and Punishment", author: "Fyodor Dostoevsky", isbn13: "9780143058144", language: "English", originalLanguage: "Russian", publisher: "Penguin Classics", publicationYear: 2003, firstPublishedYear: 1866, genre: "Fiction", coverUrl: coverById(8479260), source: "manual", verified: true, workId: wid("Crime and Punishment", "Fyodor Dostoevsky") },
      { title: "Преступление и наказание", author: "Фёдор Достоевский", titleRomanized: "Prestupleniye i nakazaniye", language: "Russian", countryOfOrigin: "Russian Empire", script: "Cyrillic", publisher: "Eksmo", publicationYear: 2005, firstPublishedYear: 1866, genre: "Fiction", source: "manual", verified: true, workId: wid("Crime and Punishment", "Fyodor Dostoevsky") },
      // War and Peace
      { title: "War and Peace", author: "Leo Tolstoy", isbn13: "9780140447934", language: "English", originalLanguage: "Russian", publisher: "Penguin Classics", publicationYear: 1982, firstPublishedYear: 1869, genre: "Fiction,History", coverUrl: coverById(8228691), source: "manual", verified: true, workId: wid("War and Peace", "Leo Tolstoy") },
      { title: "Война и мир", author: "Лев Толстой", titleRomanized: "Voyna i mir", language: "Russian", countryOfOrigin: "Russian Empire", script: "Cyrillic", publisher: "Азбука", publicationYear: 2012, firstPublishedYear: 1869, genre: "Fiction,History", source: "manual", verified: true, workId: wid("War and Peace", "Leo Tolstoy") },
      // Bridge on the Drina
      { title: "The Bridge on the Drina", author: "Ivo Andrić", isbn13: "9780226020457", isbn10: "0226020452", language: "English", originalLanguage: "Serbian", publisher: "University of Chicago Press", publicationYear: 1977, firstPublishedYear: 1945, genre: "Fiction,History", coverUrl: cover("9780226020457"), source: "manual", verified: true, workId: wid("The Bridge on the Drina", "Ivo Andrić") },
      { title: "Na Drini ćuprija", author: "Ivo Andrić", isbn13: "9788652118038", language: "Serbian", countryOfOrigin: "Yugoslavia", script: "Cyrillic", publisher: "Prosveta", publicationYear: 1945, firstPublishedYear: 1945, genre: "Fiction,History", coverUrl: cover("9788652118038"), source: "manual", verified: true, workId: wid("The Bridge on the Drina", "Ivo Andrić") },
      { title: "Die Brücke über die Drina", author: "Ivo Andrić", language: "German", originalLanguage: "Serbian", publisher: "Paul Zsolnay Verlag", publicationYear: 1953, firstPublishedYear: 1945, genre: "Fiction,History", source: "manual", verified: true, workId: wid("The Bridge on the Drina", "Ivo Andrić") },
      // Death and the Dervish
      { title: "Death and the Dervish", author: "Meša Selimović", isbn13: "9780810112384", language: "English", originalLanguage: "Bosnian", publisher: "Northwestern University Press", publicationYear: 1996, firstPublishedYear: 1966, genre: "Fiction,Philosophy", coverUrl: coverById(13127483), source: "manual", verified: true, workId: wid("Death and the Dervish", "Meša Selimović") },
      { title: "Derviš i smrt", author: "Meša Selimović", language: "Bosnian", countryOfOrigin: "Yugoslavia", script: "Latin", publisher: "Svjetlost", publicationYear: 1966, firstPublishedYear: 1966, genre: "Fiction,Philosophy", source: "manual", verified: true, workId: wid("Death and the Dervish", "Meša Selimović") },
      // Damned Yard
      { title: "The Damned Yard", author: "Ivo Andrić", language: "English", originalLanguage: "Serbian", publisher: "Forest Books", publicationYear: 1992, firstPublishedYear: 1954, genre: "Fiction", source: "manual", verified: true, workId: wid("The Damned Yard", "Ivo Andrić") },
      { title: "Prokleta avlija", author: "Ivo Andrić", language: "Serbian", countryOfOrigin: "Yugoslavia", script: "Cyrillic", publisher: "Prosveta", publicationYear: 1954, firstPublishedYear: 1954, genre: "Fiction", source: "manual", verified: true, workId: wid("The Damned Yard", "Ivo Andrić") },
      // A Brief History of Time
      { title: "A Brief History of Time", author: "Stephen Hawking", isbn13: "9780553380163", isbn10: "0553380168", language: "English", publisher: "Bantam", publicationYear: 1988, firstPublishedYear: 1988, genre: "Non-Fiction,Science", coverUrl: cover("9780553380163"), source: "manual", verified: true, workId: wid("A Brief History of Time", "Stephen Hawking") },
      { title: "A Brief History of Time (Updated Edition)", author: "Stephen Hawking", isbn13: "9780553804577", language: "English", publisher: "Bantam", publicationYear: 1998, firstPublishedYear: 1988, genre: "Non-Fiction,Science", coverUrl: cover("9780553804577"), source: "manual", verified: true, workId: wid("A Brief History of Time", "Stephen Hawking") },
      // 1984
      { title: "1984", author: "George Orwell", isbn13: "9780451524935", isbn10: "0451524934", language: "English", publisher: "Signet Classics", publicationYear: 1950, firstPublishedYear: 1949, genre: "Fiction,Sci-Fi", coverUrl: cover("9780451524935"), source: "manual", verified: true, workId: wid("1984", "George Orwell") },
      { title: "Nineteen Eighty-Four", author: "George Orwell", isbn13: "9780141036144", language: "English", publisher: "Penguin Modern Classics", publicationYear: 2004, firstPublishedYear: 1949, genre: "Fiction,Sci-Fi", coverUrl: cover("9780141036144"), source: "manual", verified: true, workId: wid("1984", "George Orwell") },
      // Left Hand of Darkness
      { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", isbn13: "9780441478125", isbn10: "0441478123", language: "English", publisher: "Ace", publicationYear: 1969, firstPublishedYear: 1969, genre: "Sci-Fi", coverUrl: cover("9780441478125"), source: "manual", verified: true, workId: wid("The Left Hand of Darkness", "Ursula K. Le Guin") },
      // Kafka Diaries
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

    console.log(`[seed] Auto-seed complete: ${allWorks.length} works, catalog populated.`);
  } catch (err) {
    // Non-fatal — server still starts without seed data
    console.log(`[seed] Auto-seed warning: ${(err as Error).message}`);
  }
}
