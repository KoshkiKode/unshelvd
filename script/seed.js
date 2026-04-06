import pg from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
const { Client } = pg;

// Open Library cover URLs by ISBN
const cover = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
const coverById = (id) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL missing');
    process.exit(1);
  }

  // Unix socket connections (Cloud SQL) don't use SSL
  const isUnixSocket = process.env.DATABASE_URL.includes("host=/");
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: isUnixSocket ? false : { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('Connected to seed DB');

    // ── Check user table ──────────────────────────────────
    const userRes = await client.query('SELECT count(*) FROM users');
    const hasUsers = parseInt(userRes.rows[0].count) > 0;
    if (hasUsers) {
      console.log('Users already exist — checking catalog...');
    }

    // ── Check catalog ─────────────────────────────────────
    const catalogRes = await client.query('SELECT count(*) FROM book_catalog');
    const worksRes = await client.query('SELECT count(*) FROM works');
    const hasCatalog = parseInt(catalogRes.rows[0].count) > 0;
    const hasWorks = parseInt(worksRes.rows[0].count) > 0;

    if (hasUsers && hasCatalog && hasWorks) {
      console.log('Database already fully seeded, skipping.');
      return;
    }

    // ── STEP 1: Seed works and catalog ───────────────────
    if (!hasWorks || !hasCatalog) {
      console.log('Seeding works and catalog...');

      const worksData = [
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', 'Hebrew', 2011, 'Non-Fiction,History', cover('9780062316097')],
        ['Meditations', 'Marcus Aurelius', 'Ancient Greek', 180, 'Philosophy', cover('9780140449334')],
        ['Blood Meridian', 'Cormac McCarthy', 'English', 1985, 'Fiction', cover('9780679728757')],
        ['Dune', 'Frank Herbert', 'English', 1965, 'Sci-Fi,Fiction', cover('9780441172719')],
        ['Kafka on the Shore', 'Haruki Murakami', 'Japanese', 2002, 'Fiction', cover('9781400079278')],
        ['The Stranger', 'Albert Camus', 'French', 1942, 'Fiction,Philosophy', cover('9780679720201')],
        ['Norwegian Wood', 'Haruki Murakami', 'Japanese', 1987, 'Fiction', cover('9780375704024')],
        ['House of Leaves', 'Mark Z. Danielewski', 'English', 2000, 'Fiction,Horror', cover('9780375703768')],
        ['The Brothers Karamazov', 'Fyodor Dostoevsky', 'Russian', 1880, 'Fiction', cover('9780374528379')],
        ['The Master and Margarita', 'Mikhail Bulgakov', 'Russian', 1967, 'Fiction,Fantasy', cover('9780141180144')],
        ['Roadside Picnic', 'Arkady and Boris Strugatsky', 'Russian', 1972, 'Sci-Fi', coverById(8443792)],
        ['Crime and Punishment', 'Fyodor Dostoevsky', 'Russian', 1866, 'Fiction', coverById(8479260)],
        ['War and Peace', 'Leo Tolstoy', 'Russian', 1869, 'Fiction,History', coverById(8228691)],
        ['The Bridge on the Drina', 'Ivo Andrić', 'Serbian', 1945, 'Fiction,History', cover('9780226020457')],
        ['Death and the Dervish', 'Meša Selimović', 'Bosnian', 1966, 'Fiction,Philosophy', coverById(13127483)],
        ['The Damned Yard', 'Ivo Andrić', 'Serbian', 1954, 'Fiction', coverById(8394082)],
        ['A Brief History of Time', 'Stephen Hawking', 'English', 1988, 'Non-Fiction,Science', cover('9780553380163')],
        ['1984', 'George Orwell', 'English', 1949, 'Fiction,Sci-Fi', cover('9780451524935')],
        ['The Left Hand of Darkness', 'Ursula K. Le Guin', 'English', 1969, 'Sci-Fi', cover('9780441478125')],
        ['The Diaries of Franz Kafka', 'Franz Kafka', 'German', 1948, 'Non-Fiction,Biography', cover('9780805209068')],
        ['One Hundred Years of Solitude', 'Gabriel García Márquez', 'Spanish', 1967, 'Fiction', coverById(8411716)],
        ['Don Quixote', 'Miguel de Cervantes', 'Spanish', 1605, 'Fiction', coverById(8416816)],
        ['Things Fall Apart', 'Chinua Achebe', 'English', 1958, 'Fiction', coverById(8468612)],
        ['The Divine Comedy', 'Dante Alighieri', 'Italian', 1320, 'Poetry,Fiction', coverById(8470260)],
        ['Hamlet', 'William Shakespeare', 'English', 1603, 'Fiction,Drama', coverById(8471820)],
      ];

      // Insert works and collect IDs
      const workIds = {};
      for (const [title, author, origLang, year, genre, coverUrl] of worksData) {
        const r = await client.query(
          `INSERT INTO works (title, author, original_language, first_published_year, genre, cover_url, source, verified)
           VALUES ($1, $2, $3, $4, $5, $6, 'manual', true)
           ON CONFLICT DO NOTHING RETURNING id`,
          [title, author, origLang, year, genre, coverUrl]
        );
        if (r.rows[0]) {
          workIds[`${title}|${author}`] = r.rows[0].id;
        }
      }

      // Re-fetch IDs for any that already existed
      const existingWorks = await client.query('SELECT id, title, author FROM works');
      for (const w of existingWorks.rows) {
        workIds[`${w.title}|${w.author}`] = w.id;
      }

      const wid = (title, author) => workIds[`${title}|${author}`] || null;

      // Insert catalog entries
      const catalogEntries = [
        // Sapiens
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'English', 'Harper', 2015, cover('9780062316097'), wid('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari')],
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780099590088', 'English', 'Vintage', 2015, cover('9780099590088'), wid('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari')],
        // Meditations
        ['Meditations', 'Marcus Aurelius', '9780140449334', 'English', 'Penguin Classics', 2006, cover('9780140449334'), wid('Meditations', 'Marcus Aurelius')],
        ['Meditations', 'Marcus Aurelius', '9780486298238', 'English', 'Dover', 1997, cover('9780486298238'), wid('Meditations', 'Marcus Aurelius')],
        // Blood Meridian
        ['Blood Meridian, or the Evening Redness in the West', 'Cormac McCarthy', '9780679728757', 'English', 'Vintage', 1992, cover('9780679728757'), wid('Blood Meridian', 'Cormac McCarthy')],
        // Dune
        ['Dune', 'Frank Herbert', '9780441172719', 'English', 'Ace', 1990, cover('9780441172719'), wid('Dune', 'Frank Herbert')],
        ['Dune', 'Frank Herbert', '9780593099322', 'English', 'Ace', 2019, coverById(13186889), wid('Dune', 'Frank Herbert')],
        // Kafka on the Shore
        ['Kafka on the Shore', 'Haruki Murakami', '9781400079278', 'English', 'Vintage', 2005, cover('9781400079278'), wid('Kafka on the Shore', 'Haruki Murakami')],
        // The Stranger
        ['The Stranger', 'Albert Camus', '9780679720201', 'English', 'Vintage', 1989, cover('9780679720201'), wid('The Stranger', 'Albert Camus')],
        ["L'Étranger", 'Albert Camus', '9782070360024', 'French', 'Gallimard', 1971, coverById(8408558), wid('The Stranger', 'Albert Camus')],
        // Norwegian Wood
        ['Norwegian Wood', 'Haruki Murakami', '9780375704024', 'English', 'Vintage', 2000, cover('9780375704024'), wid('Norwegian Wood', 'Haruki Murakami')],
        // House of Leaves
        ['House of Leaves', 'Mark Z. Danielewski', '9780375703768', 'English', 'Pantheon', 2000, cover('9780375703768'), wid('House of Leaves', 'Mark Z. Danielewski')],
        // The Brothers Karamazov
        ['The Brothers Karamazov', 'Fyodor Dostoevsky', '9780374528379', 'English', 'Farrar, Straus and Giroux', 2002, cover('9780374528379'), wid('The Brothers Karamazov', 'Fyodor Dostoevsky')],
        ['Братья Карамазовы', 'Фёдор Достоевский', '9785699015832', 'Russian', 'Eksmo', 2008, coverById(8409928), wid('The Brothers Karamazov', 'Fyodor Dostoevsky')],
        // Master and Margarita
        ['The Master and Margarita', 'Mikhail Bulgakov', '9780141180144', 'English', 'Penguin Classics', 1997, cover('9780141180144'), wid('The Master and Margarita', 'Mikhail Bulgakov')],
        ['Мастер и Маргарита', 'Михаил Булгаков', '9785170977871', 'Russian', 'AST', 2019, cover('9785170977871'), wid('The Master and Margarita', 'Mikhail Bulgakov')],
        // Roadside Picnic
        ['Roadside Picnic', 'Arkady and Boris Strugatsky', '9781613743416', 'English', 'Chicago Review Press', 2012, coverById(8443792), wid('Roadside Picnic', 'Arkady and Boris Strugatsky')],
        ['Пикник на обочине', 'Аркадий и Борис Стругацкие', null, 'Russian', 'Молодая гвардия', 1972, null, wid('Roadside Picnic', 'Arkady and Boris Strugatsky')],
        // Crime and Punishment
        ['Crime and Punishment', 'Fyodor Dostoevsky', '9780143058144', 'English', 'Penguin Classics', 2003, coverById(8479260), wid('Crime and Punishment', 'Fyodor Dostoevsky')],
        ['Преступление и наказание', 'Фёдор Достоевский', null, 'Russian', 'Eksmo', 2005, null, wid('Crime and Punishment', 'Fyodor Dostoevsky')],
        // War and Peace
        ['War and Peace', 'Leo Tolstoy', '9780140447934', 'English', 'Penguin Classics', 1982, coverById(8228691), wid('War and Peace', 'Leo Tolstoy')],
        ['Война и мир', 'Лев Толстой', null, 'Russian', 'Азбука', 2012, null, wid('War and Peace', 'Leo Tolstoy')],
        // Bridge on the Drina
        ['The Bridge on the Drina', 'Ivo Andrić', '9780226020457', 'English', 'University of Chicago Press', 1977, cover('9780226020457'), wid('The Bridge on the Drina', 'Ivo Andrić')],
        ['Na Drini ćuprija', 'Ivo Andrić', '9788652118038', 'Serbian', 'Prosveta', 1945, cover('9788652118038'), wid('The Bridge on the Drina', 'Ivo Andrić')],
        // Death and the Dervish
        ['Death and the Dervish', 'Meša Selimović', '9780810112384', 'English', 'Northwestern University Press', 1996, coverById(13127483), wid('Death and the Dervish', 'Meša Selimović')],
        ['Derviš i smrt', 'Meša Selimović', null, 'Bosnian', 'Svjetlost', 1966, null, wid('Death and the Dervish', 'Meša Selimović')],
        // Damned Yard
        ['The Damned Yard', 'Ivo Andrić', null, 'English', 'Forest Books', 1992, null, wid('The Damned Yard', 'Ivo Andrić')],
        ['Prokleta avlija', 'Ivo Andrić', null, 'Serbian', 'Prosveta', 1954, null, wid('The Damned Yard', 'Ivo Andrić')],
        // A Brief History of Time
        ['A Brief History of Time', 'Stephen Hawking', '9780553380163', 'English', 'Bantam', 1988, cover('9780553380163'), wid('A Brief History of Time', 'Stephen Hawking')],
        ['A Brief History of Time (Updated Edition)', 'Stephen Hawking', '9780553804577', 'English', 'Bantam', 1998, cover('9780553804577'), wid('A Brief History of Time', 'Stephen Hawking')],
        // 1984
        ['1984', 'George Orwell', '9780451524935', 'English', 'Signet Classics', 1950, cover('9780451524935'), wid('1984', 'George Orwell')],
        ['Nineteen Eighty-Four', 'George Orwell', '9780141036144', 'English', 'Penguin Modern Classics', 2004, cover('9780141036144'), wid('1984', 'George Orwell')],
        // Left Hand of Darkness
        ['The Left Hand of Darkness', 'Ursula K. Le Guin', '9780441478125', 'English', 'Ace', 1969, cover('9780441478125'), wid('The Left Hand of Darkness', 'Ursula K. Le Guin')],
        // Kafka Diaries
        ["The Diaries of Franz Kafka", 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1988, cover('9780805209068'), wid('The Diaries of Franz Kafka', 'Franz Kafka')],
        ['Tagebücher', 'Franz Kafka', null, 'German', 'S. Fischer Verlag', 1954, null, wid('The Diaries of Franz Kafka', 'Franz Kafka')],
        // One Hundred Years of Solitude
        ['One Hundred Years of Solitude', 'Gabriel García Márquez', '9780060883287', 'English', 'Harper Perennial Modern Classics', 2006, coverById(8411716), wid('One Hundred Years of Solitude', 'Gabriel García Márquez')],
        ['Cien años de soledad', 'Gabriel García Márquez', '9788497592208', 'Spanish', 'Cátedra', 2007, null, wid('One Hundred Years of Solitude', 'Gabriel García Márquez')],
        // Don Quixote
        ['Don Quixote', 'Miguel de Cervantes', '9780060934347', 'English', 'Harper Perennial Modern Classics', 2003, coverById(8416816), wid('Don Quixote', 'Miguel de Cervantes')],
        ['El ingenioso hidalgo don Quijote de la Mancha', 'Miguel de Cervantes', null, 'Spanish', 'Real Academia Española', 2004, null, wid('Don Quixote', 'Miguel de Cervantes')],
        // Things Fall Apart
        ['Things Fall Apart', 'Chinua Achebe', '9780385474542', 'English', 'Anchor', 1994, coverById(8468612), wid('Things Fall Apart', 'Chinua Achebe')],
        // The Divine Comedy
        ['The Divine Comedy', 'Dante Alighieri', '9780142437223', 'English', 'Penguin Classics', 2003, coverById(8470260), wid('The Divine Comedy', 'Dante Alighieri')],
        ['La Divina Commedia', 'Dante Alighieri', null, 'Italian', 'Einaudi', 2014, null, wid('The Divine Comedy', 'Dante Alighieri')],
        // Hamlet
        ['Hamlet', 'William Shakespeare', '9780743477123', 'English', 'Simon & Schuster', 2003, coverById(8471820), wid('Hamlet', 'William Shakespeare')],
      ];

      for (const [title, author, isbn13, language, publisher, pubYear, coverUrl, workId] of catalogEntries) {
        await client.query(
          `INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, cover_url, work_id, source, verified)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual', true)
           ON CONFLICT DO NOTHING`,
          [title, author, isbn13, language, publisher, pubYear, coverUrl, workId]
        );
      }

      console.log(`✅ Seeded ${worksData.length} works and ${catalogEntries.length} catalog entries.`);
    }

    // ── STEP 2: Seed users and books if needed ────────────
    if (!hasUsers) {
      console.log('Seeding users and books...');

      const demoHash = await bcrypt.hash('DemoPassword!234', 12);
      const adminPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url').slice(0, 16) + '!A1';
      const adminHash = await bcrypt.hash(adminPass, 12);
      const adminUsername = process.env.ADMIN_USERNAME || crypto.randomBytes(4).toString('hex');
      const adminEmail = process.env.ADMIN_EMAIL || `${adminUsername}@unshelvd.com`;

      console.log(`Admin username: ${adminUsername}  email: ${adminEmail}  password: ${adminPass}`);

      await client.query(
        'INSERT INTO users (username, display_name, email, password, role, location) VALUES ($1, $2, $3, $4, $5, $6)',
        [adminUsername, "Unshelv'd Admin", adminEmail, adminHash, 'admin', 'Battle Creek, MI']
      );

      const janeRes = await client.query(
        'INSERT INTO users (username, display_name, email, password, bio, location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        ['bookworm', 'Jane Reader', 'jane@example.com', demoHash, 'Avid reader and collector. Always looking for rare first editions.', 'Portland, OR']
      );
      const janeId = janeRes.rows[0].id;

      const alexRes = await client.query(
        'INSERT INTO users (username, display_name, email, password, bio, location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        ['alexshelves', 'Alex Shelves', 'alex@example.com', demoHash, 'Philosophy and sci-fi enthusiast. My shelves are overflowing.', 'Austin, TX']
      );
      const alexId = alexRes.rows[0].id;

      const mirkoRes = await client.query(
        'INSERT INTO users (username, display_name, email, password, bio, location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        ['mirko_knjige', 'Mirko Petrović', 'mirko@example.com', demoHash, 'Collector of Yugoslav, Soviet, and Eastern European literature.', 'Belgrade, Serbia']
      );
      const mirkoId = mirkoRes.rows[0].id;

      // Helper to get work_id by title+author
      const getWorkId = async (title, author) => {
        const r = await client.query('SELECT id FROM works WHERE title=$1 AND author=$2 LIMIT 1', [title, author]);
        return r.rows[0]?.id || null;
      };

      // Jane's books
      const janeBooks = [
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'like-new', 'for-sale', 15.99, 'Non-Fiction,History', 'Harper'],
        ['Meditations', 'Marcus Aurelius', '9780140449334', 'fair', 'for-sale', 12.00, 'Philosophy', 'Penguin Classics'],
        ['Blood Meridian', 'Cormac McCarthy', '9780679728757', 'good', 'for-sale', 24.99, 'Fiction', 'Vintage'],
        ['Dune', 'Frank Herbert', '9780441172719', 'good', 'for-sale', 18.50, 'Sci-Fi', 'Ace'],
        ['Kafka on the Shore', 'Haruki Murakami', '9781400079278', 'like-new', 'open-to-offers', null, 'Fiction', 'Vintage'],
        ['The Stranger', 'Albert Camus', '9780679720201', 'good', 'not-for-sale', null, 'Fiction,Philosophy', 'Vintage'],
        ['Norwegian Wood', 'Haruki Murakami', '9780375704024', 'like-new', 'reading', null, 'Fiction', 'Vintage'],
        ['House of Leaves', 'Mark Z. Danielewski', '9780375703768', 'new', 'wishlist', null, 'Fiction,Horror', null],
      ];
      for (const [title, author, isbn, condition, status, price, genre, publisher] of janeBooks) {
        const workId = await getWorkId(title, author);
        await client.query(
          'INSERT INTO books (user_id, title, author, isbn, cover_url, condition, status, price, genre, publisher, work_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [janeId, title, author, isbn, isbn ? cover(isbn) : null, condition, status, price, genre, publisher, workId]
        );
      }

      // Alex's books
      const alexBooks = [
        ['The Brothers Karamazov', 'Fyodor Dostoevsky', '9780374528379', 'fair', 'for-sale', 14.50, 'Fiction', 'Farrar, Straus and Giroux', 'English', 'Russian', 'Russian Empire', 'Antique (Pre-1900)'],
        ['A Brief History of Time', 'Stephen Hawking', '9780553380163', 'new', 'for-sale', 22.00, 'Non-Fiction,Science', 'Bantam', 'English', null, 'United Kingdom', 'Modern (1970-2000)'],
        ['1984', 'George Orwell', '9780451524935', 'good', 'for-sale', 9.99, 'Fiction,Sci-Fi', 'Signet Classics', 'English', null, 'United Kingdom', 'Vintage (1900-1970)'],
        ['The Left Hand of Darkness', 'Ursula K. Le Guin', '9780441478125', 'good', 'open-to-offers', null, 'Sci-Fi', 'Ace', 'English', null, 'United States', 'Vintage (1900-1970)'],
      ];
      for (const [title, author, isbn, condition, status, price, genre, publisher, lang, origLang, country, era] of alexBooks) {
        const workId = await getWorkId(title, author);
        await client.query(
          'INSERT INTO books (user_id, title, author, isbn, cover_url, condition, status, price, genre, publisher, language, original_language, country_of_origin, era, work_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
          [alexId, title, author, isbn, isbn ? cover(isbn) : null, condition, status, price, genre, publisher, lang, origLang, country, era, workId]
        );
      }

      // Mirko's books
      const mirkoBooks = [
        ['Na Drini ćuprija', 'Ivo Andrić', '9788652118038', 'good', 'for-sale', 35.00, 'Fiction,History', 'Prosveta', 'Serbian', null, 'Yugoslavia', 'Vintage (1900-1970)', 'Cyrillic', 'The Bridge on the Drina', 'Ivo Andrić'],
        ['The Bridge on the Drina', 'Ivo Andrić', '9780226020457', 'like-new', 'for-sale', 18.00, 'Fiction,History', 'University of Chicago Press', 'English', 'Serbian', 'Yugoslavia', 'Vintage (1900-1970)', 'Latin', 'The Bridge on the Drina', 'Ivo Andrić'],
        ['Мастер и Маргарита', 'Михаил Булгаков', '9785170977871', 'fair', 'open-to-offers', null, 'Fiction,Fantasy', 'AST', 'Russian', null, 'USSR / Soviet Union', 'Vintage (1900-1970)', 'Cyrillic', 'The Master and Margarita', 'Mikhail Bulgakov'],
        ['The Master and Margarita', 'Mikhail Bulgakov', '9780141180144', 'good', 'for-sale', 14.00, 'Fiction,Fantasy', 'Penguin Classics', 'English', 'Russian', 'USSR / Soviet Union', 'Vintage (1900-1970)', 'Latin', 'The Master and Margarita', 'Mikhail Bulgakov'],
        ['Derviš i smrt', 'Meša Selimović', null, 'good', 'for-sale', 28.00, 'Fiction,Philosophy', 'Svjetlost', 'Bosnian', null, 'Yugoslavia', 'Vintage (1900-1970)', 'Latin', 'Death and the Dervish', 'Meša Selimović'],
        ['Сталкер (Strugatsky brothers)', 'Аркадий и Борис Стругацкие', null, 'fair', 'open-to-offers', null, 'Sci-Fi', 'Молодая гвардия', 'Russian', null, 'USSR / Soviet Union', 'Modern (1970-2000)', 'Cyrillic', 'Roadside Picnic', 'Arkady and Boris Strugatsky'],
        ["Kafka's Diaries", 'Franz Kafka', '9780805209068', 'good', 'not-for-sale', null, 'Non-Fiction,Biography', 'Schocken', 'English', 'German', 'Austria-Hungary', 'Vintage (1900-1970)', 'Latin', 'The Diaries of Franz Kafka', 'Franz Kafka'],
        ['Prokleta avlija', 'Ivo Andrić', null, 'fair', 'for-sale', 22.00, 'Fiction', 'Prosveta', 'Serbian', null, 'Yugoslavia', 'Vintage (1900-1970)', 'Cyrillic', 'The Damned Yard', 'Ivo Andrić'],
      ];
      for (const [title, author, isbn, condition, status, price, genre, publisher, lang, origLang, country, era, script, workTitle, workAuthor] of mirkoBooks) {
        const workId = await getWorkId(workTitle, workAuthor);
        await client.query(
          'INSERT INTO books (user_id, title, author, isbn, cover_url, condition, status, price, genre, publisher, language, original_language, country_of_origin, era, script, work_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
          [mirkoId, title, author, isbn, isbn ? cover(isbn) : null, condition, status, price, genre, publisher, lang, origLang, country, era, script, workId]
        );
      }

      // Book requests
      await client.query(
        "INSERT INTO book_requests (user_id, title, author, description, max_price, edition) VALUES ($1,$2,$3,$4,$5,$6)",
        [alexId, "Gravity's Rainbow", 'Thomas Pynchon', 'Penguin Classics edition or original Viking Press.', 45, 'Penguin Classics']
      );
      await client.query(
        "INSERT INTO book_requests (user_id, title, author, description, max_price) VALUES ($1,$2,$3,$4,$5)",
        [janeId, 'The Wind-Up Bird Chronicle', 'Haruki Murakami', 'Any edition in good condition. Hardcover preferred.', 30]
      );
      await client.query(
        "INSERT INTO book_requests (user_id, title, author, description, max_price, edition) VALUES ($1,$2,$3,$4,$5,$6)",
        [alexId, 'Infinite Jest', 'David Foster Wallace', 'Looking for a clean first edition, preferably with dust jacket intact.', 150, 'First Edition']
      );
      await client.query(
        "INSERT INTO book_requests (user_id, title, author, description, max_price, language, country_of_origin) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [mirkoId, 'Travnička hronika', 'Ivo Andrić', 'Original Yugoslav edition from Prosveta or Srpska književna zadruga.', 60, 'Serbian', 'Yugoslavia']
      );
      await client.query(
        "INSERT INTO book_requests (user_id, title, author, description, max_price, language, country_of_origin) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [mirkoId, 'We', 'Yevgeny Zamyatin', 'Looking for an original Russian edition (Мы). Any Soviet-era print.', 100, 'Russian', 'USSR / Soviet Union']
      );

      console.log('✅ Users, books, and requests seeded!');
    }

    console.log('✅ Seeding complete!');
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
