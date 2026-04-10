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
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', 'Hebrew', 2011, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg'],
        ['Meditations', 'Marcus Aurelius', 'Ancient Greek', 180, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg'],
        ['Blood Meridian', 'Cormac McCarthy', 'English', 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg'],
        ['Dune', 'Frank Herbert', 'English', 1965, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg'],
        ['Kafka on the Shore', 'Haruki Murakami', 'Japanese', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg'],
        ['The Stranger', 'Albert Camus', 'French', 1942, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg'],
        ['Norwegian Wood', 'Haruki Murakami', 'Japanese', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg'],
        ['House of Leaves', 'Mark Z. Danielewski', 'English', 2000, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg'],
        ['The Brothers Karamazov', 'Fyodor Dostoevsky', 'Russian', 1880, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg'],
        ['The Master and Margarita', 'Mikhail Bulgakov', 'Russian', 1967, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg'],
        ['Roadside Picnic', 'Arkady and Boris Strugatsky', 'Russian', 1972, 'Sci-Fi', 'https://covers.openlibrary.org/b/id/8443792-L.jpg'],
        ['Crime and Punishment', 'Fyodor Dostoevsky', 'Russian', 1866, 'Fiction', 'https://covers.openlibrary.org/b/id/8479260-L.jpg'],
        ['War and Peace', 'Leo Tolstoy', 'Russian', 1869, 'Fiction,History', 'https://covers.openlibrary.org/b/id/8228691-L.jpg'],
        ['The Bridge on the Drina', 'Ivo Andric', 'Serbian', 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg'],
        ['Death and the Dervish', 'Mesa Selimovic', 'Bosnian', 1966, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/13127483-L.jpg'],
        ['The Damned Yard', 'Ivo Andric', 'Serbian', 1954, 'Fiction', 'https://covers.openlibrary.org/b/id/8394082-L.jpg'],
        ['A Brief History of Time', 'Stephen Hawking', 'English', 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg'],
        ['1984', 'George Orwell', 'English', 1949, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg'],
        ['The Left Hand of Darkness', 'Ursula K. Le Guin', 'English', 1969, 'Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg'],
        ['The Diaries of Franz Kafka', 'Franz Kafka', 'German', 1948, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg'],
        ['One Hundred Years of Solitude', 'Gabriel Garcia Marquez', 'Spanish', 1967, 'Fiction', 'https://covers.openlibrary.org/b/id/8411716-L.jpg'],
        ['Don Quixote', 'Miguel de Cervantes', 'Spanish', 1605, 'Fiction', 'https://covers.openlibrary.org/b/id/8416816-L.jpg'],
        ['Things Fall Apart', 'Chinua Achebe', 'English', 1958, 'Fiction', 'https://covers.openlibrary.org/b/id/8468612-L.jpg'],
        ['The Divine Comedy', 'Dante Alighieri', 'Italian', 1320, 'Poetry,Fiction', 'https://covers.openlibrary.org/b/id/8470260-L.jpg'],
        ['Hamlet', 'William Shakespeare', 'English', 1603, 'Fiction,Drama', 'https://covers.openlibrary.org/b/id/8471820-L.jpg'],
        ['Anna Karenina', 'Leo Tolstoy', 'Russian', 1877, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143035008-L.jpg'],
        ['The Idiot', 'Fyodor Dostoevsky', 'Russian', 1869, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140447927-L.jpg'],
        ['Notes from Underground', 'Fyodor Dostoevsky', 'Russian', 1864, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg'],
        ['Dead Souls', 'Nikolai Gogol', 'Russian', 1842, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140448078-L.jpg'],
        ['We', 'Yevgeny Zamyatin', 'Russian', 1924, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780140185852-L.jpg'],
        ['Doctor Zhivago', 'Boris Pasternak', 'Russian', 1957, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375408694-L.jpg'],
        ['The Trial', 'Franz Kafka', 'German', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg'],
        ['The Metamorphosis', 'Franz Kafka', 'German', 1915, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780553213690-L.jpg'],
        ['Siddhartha', 'Hermann Hesse', 'German', 1922, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780553208849-L.jpg'],
        ['Steppenwolf', 'Hermann Hesse', 'German', 1927, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312278908-L.jpg'],
        ['The Magic Mountain', 'Thomas Mann', 'German', 1924, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679772873-L.jpg'],
        ['Death in Venice', 'Thomas Mann', 'German', 1912, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679722068-L.jpg'],
        ['The Tin Drum', 'Gunter Grass', 'German', 1959, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156900430-L.jpg'],
        ['Faust', 'Johann Wolfgang von Goethe', 'German', 1808, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780140440201-L.jpg'],
        ['Madame Bovary', 'Gustave Flaubert', 'French', 1857, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143136019-L.jpg'],
        ['Les Miserables', 'Victor Hugo', 'French', 1862, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140444308-L.jpg'],
        ['The Count of Monte Cristo', 'Alexandre Dumas', 'French', 1844, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg'],
        ['Swann\'s Way', 'Marcel Proust', 'French', 1913, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437964-L.jpg'],
        ['Nausea', 'Jean-Paul Sartre', 'French', 1938, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780811201224-L.jpg'],
        ['The Plague', 'Albert Camus', 'French', 1947, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679720218-L.jpg'],
        ['Waiting for Godot', 'Samuel Beckett', 'French', 1953, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780802130341-L.jpg'],
        ['Journey to the End of the Night', 'Louis-Ferdinand Celine', 'French', 1932, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811201889-L.jpg'],
        ['The Little Prince', 'Antoine de Saint-Exupery', 'French', 1943, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg'],
        ['Love in the Time of Cholera', 'Gabriel Garcia Marquez', 'Spanish', 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140157741-L.jpg'],
        ['Ficciones', 'Jorge Luis Borges', 'Spanish', 1944, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802130303-L.jpg'],
        ['Pedro Paramo', 'Juan Rulfo', 'Spanish', 1955, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802144904-L.jpg'],
        ['The House of the Spirits', 'Isabel Allende', 'Spanish', 1982, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781501117015-L.jpg'],
        ['Blindness', 'Jose Saramago', 'Portuguese', 1995, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156007757-L.jpg'],
        ['The Book of Disquiet', 'Fernando Pessoa', 'Portuguese', 1982, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780141183046-L.jpg'],
        ['If on a winter\'s night a traveler', 'Italo Calvino', 'Italian', 1979, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156439619-L.jpg'],
        ['The Name of the Rose', 'Umberto Eco', 'Italian', 1980, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156001311-L.jpg'],
        ['The Leopard', 'Giuseppe Tomasi di Lampedusa', 'Italian', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375714566-L.jpg'],
        ['Snow Country', 'Yasunari Kawabata', 'Japanese', 1956, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679761051-L.jpg'],
        ['No Longer Human', 'Osamu Dazai', 'Japanese', 1948, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg'],
        ['The Sound of Waves', 'Yukio Mishima', 'Japanese', 1954, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679752684-L.jpg'],
        ['1Q84', 'Haruki Murakami', 'Japanese', 2009, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307593313-L.jpg'],
        ['The Wind-Up Bird Chronicle', 'Haruki Murakami', 'Japanese', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679775430-L.jpg'],
        ['Silence', 'Shusaku Endo', 'Japanese', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312422608-L.jpg'],
        ['Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa', 'Japanese', 1915, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449709-L.jpg'],
        ['Dream of the Red Chamber', 'Cao Xueqin', 'Classical Chinese', 1791, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140443714-L.jpg'],
        ['Journey to the West', 'Wu Cheng-en', 'Classical Chinese', 1592, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780226920535-L.jpg'],
        ['The Iliad', 'Homer', 'Ancient Greek', -800, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140447940-L.jpg'],
        ['The Odyssey', 'Homer', 'Ancient Greek', -800, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140268867-L.jpg'],
        ['The Aeneid', 'Virgil', 'Latin', -19, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140449327-L.jpg'],
        ['The Republic', 'Plato', 'Ancient Greek', -380, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140455113-L.jpg'],
        ['The Art of War', 'Sun Tzu', 'Classical Chinese', -500, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780199540174-L.jpg'],
        ['Tao Te Ching', 'Lao Tzu', 'Classical Chinese', -400, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140441314-L.jpg'],
        ['The Analects', 'Confucius', 'Classical Chinese', -479, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140443486-L.jpg'],
        ['Bhagavad Gita', 'Vyasa', 'Sanskrit', -200, 'Philosophy,Religion', 'https://covers.openlibrary.org/b/isbn/9780140449181-L.jpg'],
        ['Beowulf', 'Anonymous', 'Old English', 700, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393320978-L.jpg'],
        ['The Canterbury Tales', 'Geoffrey Chaucer', 'Middle English', 1387, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140422344-L.jpg'],
        ['The Decameron', 'Giovanni Boccaccio', 'Italian', 1353, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449303-L.jpg'],
        ['Paradise Lost', 'John Milton', 'English', 1667, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780140424393-L.jpg'],
        ['Candide', 'Voltaire', 'French', 1759, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140440041-L.jpg'],
        ['Robinson Crusoe', 'Daniel Defoe', 'English', 1719, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439822-L.jpg'],
        ['Pride and Prejudice', 'Jane Austen', 'English', 1813, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg'],
        ['Jane Eyre', 'Charlotte Bronte', 'English', 1847, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg'],
        ['Wuthering Heights', 'Emily Bronte', 'English', 1847, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439556-L.jpg'],
        ['Great Expectations', 'Charles Dickens', 'English', 1861, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439563-L.jpg'],
        ['Moby-Dick', 'Herman Melville', 'English', 1851, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg'],
        ['The Scarlet Letter', 'Nathaniel Hawthorne', 'English', 1850, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437261-L.jpg'],
        ['Adventures of Huckleberry Finn', 'Mark Twain', 'English', 1884, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437179-L.jpg'],
        ['Dracula', 'Bram Stoker', 'English', 1897, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780141439846-L.jpg'],
        ['The Picture of Dorian Gray', 'Oscar Wilde', 'English', 1890, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141442464-L.jpg'],
        ['Ulysses', 'James Joyce', 'English', 1922, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780394743127-L.jpg'],
        ['Mrs Dalloway', 'Virginia Woolf', 'English', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156628709-L.jpg'],
        ['Animal Farm', 'George Orwell', 'English', 1945, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg'],
        ['Brave New World', 'Aldous Huxley', 'English', 1932, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg'],
        ['Lord of the Flies', 'William Golding', 'English', 1954, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780399501487-L.jpg'],
        ['A Clockwork Orange', 'Anthony Burgess', 'English', 1962, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393312836-L.jpg'],
        ['The Great Gatsby', 'F. Scott Fitzgerald', 'English', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg'],
        ['The Sound and the Fury', 'William Faulkner', 'English', 1929, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679732242-L.jpg'],
        ['To Kill a Mockingbird', 'Harper Lee', 'English', 1960, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg'],
        ['The Grapes of Wrath', 'John Steinbeck', 'English', 1939, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143039433-L.jpg'],
        ['East of Eden', 'John Steinbeck', 'English', 1952, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142004234-L.jpg'],
        ['Catch-22', 'Joseph Heller', 'English', 1961, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781451626650-L.jpg'],
        ['Slaughterhouse-Five', 'Kurt Vonnegut', 'English', 1969, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780440180296-L.jpg'],
        ['The Catcher in the Rye', 'J.D. Salinger', 'English', 1951, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg'],
        ['On the Road', 'Jack Kerouac', 'English', 1957, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140283297-L.jpg'],
        ['Beloved', 'Toni Morrison', 'English', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400033416-L.jpg'],
        ['The Road', 'Cormac McCarthy', 'English', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg'],
        ['The Hobbit', 'J.R.R. Tolkien', 'English', 1937, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg'],
        ['The Fellowship of the Ring', 'J.R.R. Tolkien', 'English', 1954, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780618574940-L.jpg'],
        ['Foundation', 'Isaac Asimov', 'English', 1951, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg'],
        ['Fahrenheit 451', 'Ray Bradbury', 'English', 1953, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg'],
        ['Neuromancer', 'William Gibson', 'English', 1984, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg'],
        ['Do Androids Dream of Electric Sheep?', 'Philip K. Dick', 'English', 1968, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345404473-L.jpg'],
        ['The Hitchhiker\'s Guide to the Galaxy', 'Douglas Adams', 'English', 1979, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg'],
        ['On the Origin of Species', 'Charles Darwin', 'English', 1859, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780140432053-L.jpg'],
        ['Man\'s Search for Meaning', 'Viktor Frankl', 'German', 1946, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg'],
        ['The Diary of a Young Girl', 'Anne Frank', 'Dutch', 1947, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780553296983-L.jpg'],
        ['Night', 'Elie Wiesel', 'French', 1958, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780374500016-L.jpg'],
        ['In Cold Blood', 'Truman Capote', 'English', 1966, 'Non-Fiction', 'https://covers.openlibrary.org/b/isbn/9780679745587-L.jpg'],
        ['The Remains of the Day', 'Kazuo Ishiguro', 'English', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679731726-L.jpg'],
        ['Never Let Me Go', 'Kazuo Ishiguro', 'English', 2005, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400078776-L.jpg'],
        ['The Kite Runner', 'Khaled Hosseini', 'English', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781594631931-L.jpg'],
        ['Life of Pi', 'Yann Martel', 'English', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156027328-L.jpg'],
        ['Midnight\'s Children', 'Salman Rushdie', 'English', 1981, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg'],
        ['The God of Small Things', 'Arundhati Roy', 'English', 1997, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679457312-L.jpg'],
        ['Gitanjali', 'Rabindranath Tagore', 'Bengali', 1910, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780333902981-L.jpg'],
        ['Season of Migration to the North', 'Tayeb Salih', 'Arabic', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780894108501-L.jpg'],
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
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'English', 'Harper', 2015, 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', wid('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari')],
        ['Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780099590088', 'English', 'Vintage', 2015, 'https://covers.openlibrary.org/b/isbn/9780099590088-L.jpg', wid('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari')],
        ['Meditations', 'Marcus Aurelius', '9780140449334', 'English', 'Penguin Classics', 2006, 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', wid('Meditations', 'Marcus Aurelius')],
        ['Meditations', 'Marcus Aurelius', '9780486298238', 'English', 'Dover', 1997, 'https://covers.openlibrary.org/b/isbn/9780486298238-L.jpg', wid('Meditations', 'Marcus Aurelius')],
        ['Blood Meridian, or the Evening Redness in the West', 'Cormac McCarthy', '9780679728757', 'English', 'Vintage', 1992, 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', wid('Blood Meridian', 'Cormac McCarthy')],
        ['Dune', 'Frank Herbert', '9780441172719', 'English', 'Ace', 1990, 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', wid('Dune', 'Frank Herbert')],
        ['Dune', 'Frank Herbert', '9780593099322', 'English', 'Ace', 2019, 'https://covers.openlibrary.org/b/id/13186889-L.jpg', wid('Dune', 'Frank Herbert')],
        ['Kafka on the Shore', 'Haruki Murakami', '9781400079278', 'English', 'Vintage', 2005, 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', wid('Kafka on the Shore', 'Haruki Murakami')],
        ['Umibe no Kafuka', 'Murakami Haruki', '9784101001616', 'Japanese', 'Shinchosha', 2005, 'https://covers.openlibrary.org/b/id/8471060-L.jpg', wid('Kafka on the Shore', 'Haruki Murakami')],
        ['The Stranger', 'Albert Camus', '9780679720201', 'English', 'Vintage', 1989, 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', wid('The Stranger', 'Albert Camus')],
        ['L\'Etranger', 'Albert Camus', '9782070360024', 'French', 'Gallimard', 1971, 'https://covers.openlibrary.org/b/id/8408558-L.jpg', wid('The Stranger', 'Albert Camus')],
        ['Norwegian Wood', 'Haruki Murakami', '9780375704024', 'English', 'Vintage', 2000, 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', wid('Norwegian Wood', 'Haruki Murakami')],
        ['Noruwei no Mori', 'Murakami Haruki', '9784062749497', 'Japanese', 'Kodansha', 2004, null, wid('Norwegian Wood', 'Haruki Murakami')],
        ['House of Leaves', 'Mark Z. Danielewski', '9780375703768', 'English', 'Pantheon', 2000, 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', wid('House of Leaves', 'Mark Z. Danielewski')],
        ['The Brothers Karamazov', 'Fyodor Dostoevsky', '9780374528379', 'English', 'Farrar Straus Giroux', 2002, 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', wid('The Brothers Karamazov', 'Fyodor Dostoevsky')],
        ['Bratya Karamazovy', 'Fyodor Dostoyevsky', null, 'Russian', 'Eksmo', 2008, 'https://covers.openlibrary.org/b/id/8409928-L.jpg', wid('The Brothers Karamazov', 'Fyodor Dostoevsky')],
        ['The Master and Margarita', 'Mikhail Bulgakov', '9780141180144', 'English', 'Penguin Classics', 1997, 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', wid('The Master and Margarita', 'Mikhail Bulgakov')],
        ['Master i Margarita', 'Mikhail Bulgakov', '9785170977871', 'Russian', 'AST', 2019, 'https://covers.openlibrary.org/b/isbn/9785170977871-L.jpg', wid('The Master and Margarita', 'Mikhail Bulgakov')],
        ['Roadside Picnic', 'Arkady and Boris Strugatsky', '9781613743416', 'English', 'Chicago Review Press', 2012, 'https://covers.openlibrary.org/b/id/8443792-L.jpg', wid('Roadside Picnic', 'Arkady and Boris Strugatsky')],
        ['Piknik na obochine', 'Arkady i Boris Strugatsky', null, 'Russian', 'Molodaya gvardiya', 1972, null, wid('Roadside Picnic', 'Arkady and Boris Strugatsky')],
        ['Crime and Punishment', 'Fyodor Dostoevsky', '9780143058144', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/id/8479260-L.jpg', wid('Crime and Punishment', 'Fyodor Dostoevsky')],
        ['Prestupleniye i nakazaniye', 'Fyodor Dostoyevsky', null, 'Russian', 'Eksmo', 2005, null, wid('Crime and Punishment', 'Fyodor Dostoevsky')],
        ['War and Peace', 'Leo Tolstoy', '9780140447934', 'English', 'Penguin Classics', 1982, 'https://covers.openlibrary.org/b/id/8228691-L.jpg', wid('War and Peace', 'Leo Tolstoy')],
        ['Voyna i mir', 'Lev Tolstoy', null, 'Russian', 'Azbuka', 2012, null, wid('War and Peace', 'Leo Tolstoy')],
        ['The Bridge on the Drina', 'Ivo Andric', '9780226020457', 'English', 'University of Chicago Press', 1977, 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', wid('The Bridge on the Drina', 'Ivo Andric')],
        ['Na Drini cuprija', 'Ivo Andric', '9788652118038', 'Serbian', 'Prosveta', 1945, 'https://covers.openlibrary.org/b/isbn/9788652118038-L.jpg', wid('The Bridge on the Drina', 'Ivo Andric')],
        ['Death and the Dervish', 'Mesa Selimovic', '9780810112384', 'English', 'Northwestern University Press', 1996, 'https://covers.openlibrary.org/b/id/13127483-L.jpg', wid('Death and the Dervish', 'Mesa Selimovic')],
        ['Dervis i smrt', 'Mesa Selimovic', null, 'Bosnian', 'Svjetlost', 1966, null, wid('Death and the Dervish', 'Mesa Selimovic')],
        ['The Damned Yard', 'Ivo Andric', null, 'English', 'Forest Books', 1992, null, wid('The Damned Yard', 'Ivo Andric')],
        ['Prokleta avlija', 'Ivo Andric', null, 'Serbian', 'Prosveta', 1954, null, wid('The Damned Yard', 'Ivo Andric')],
        ['A Brief History of Time', 'Stephen Hawking', '9780553380163', 'English', 'Bantam', 1988, 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', wid('A Brief History of Time', 'Stephen Hawking')],
        ['A Brief History of Time (Updated Edition)', 'Stephen Hawking', '9780553804577', 'English', 'Bantam', 1998, 'https://covers.openlibrary.org/b/isbn/9780553804577-L.jpg', wid('A Brief History of Time', 'Stephen Hawking')],
        ['1984', 'George Orwell', '9780451524935', 'English', 'Signet Classics', 1950, 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', wid('1984', 'George Orwell')],
        ['Nineteen Eighty-Four', 'George Orwell', '9780141036144', 'English', 'Penguin Modern Classics', 2004, 'https://covers.openlibrary.org/b/isbn/9780141036144-L.jpg', wid('1984', 'George Orwell')],
        ['The Left Hand of Darkness', 'Ursula K. Le Guin', '9780441478125', 'English', 'Ace', 1969, 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', wid('The Left Hand of Darkness', 'Ursula K. Le Guin')],
        ['The Diaries of Franz Kafka', 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1988, 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', wid('The Diaries of Franz Kafka', 'Franz Kafka')],
        ['Tagebucher', 'Franz Kafka', null, 'German', 'S. Fischer Verlag', 1954, null, wid('The Diaries of Franz Kafka', 'Franz Kafka')],
        ['One Hundred Years of Solitude', 'Gabriel Garcia Marquez', '9780060883287', 'English', 'Harper Perennial', 2006, 'https://covers.openlibrary.org/b/id/8411716-L.jpg', wid('One Hundred Years of Solitude', 'Gabriel Garcia Marquez')],
        ['Cien anos de soledad', 'Gabriel Garcia Marquez', '9788497592208', 'Spanish', 'Catedra', 2007, null, wid('One Hundred Years of Solitude', 'Gabriel Garcia Marquez')],
        ['Don Quixote', 'Miguel de Cervantes', '9780060934347', 'English', 'Harper Perennial', 2003, 'https://covers.openlibrary.org/b/id/8416816-L.jpg', wid('Don Quixote', 'Miguel de Cervantes')],
        ['El ingenioso hidalgo don Quijote', 'Miguel de Cervantes', null, 'Spanish', 'Real Academia Espanola', 2004, null, wid('Don Quixote', 'Miguel de Cervantes')],
        ['Things Fall Apart', 'Chinua Achebe', '9780385474542', 'English', 'Anchor', 1994, 'https://covers.openlibrary.org/b/id/8468612-L.jpg', wid('Things Fall Apart', 'Chinua Achebe')],
        ['The Divine Comedy', 'Dante Alighieri', '9780142437223', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/id/8470260-L.jpg', wid('The Divine Comedy', 'Dante Alighieri')],
        ['La Divina Commedia', 'Dante Alighieri', null, 'Italian', 'Einaudi', 2014, null, wid('The Divine Comedy', 'Dante Alighieri')],
        ['Hamlet', 'William Shakespeare', '9780743477123', 'English', 'Simon and Schuster', 2003, 'https://covers.openlibrary.org/b/id/8471820-L.jpg', wid('Hamlet', 'William Shakespeare')],
        ['Anna Karenina', 'Leo Tolstoy', '9780143035008', 'English', 'Penguin Classics', 2000, 'https://covers.openlibrary.org/b/isbn/9780143035008-L.jpg', wid('Anna Karenina', 'Leo Tolstoy')],
        ['Anna Karenina', 'Lev Tolstoy', null, 'Russian', 'Azbuka', 2013, null, wid('Anna Karenina', 'Leo Tolstoy')],
        ['The Idiot', 'Fyodor Dostoevsky', '9780140447927', 'English', 'Penguin Classics', 2004, 'https://covers.openlibrary.org/b/isbn/9780140447927-L.jpg', wid('The Idiot', 'Fyodor Dostoevsky')],
        ['Notes from Underground', 'Fyodor Dostoevsky', '9780140449136', 'English', 'Penguin Classics', 2009, 'https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg', wid('Notes from Underground', 'Fyodor Dostoevsky')],
        ['Dead Souls', 'Nikolai Gogol', '9780140448078', 'English', 'Penguin Classics', 2004, 'https://covers.openlibrary.org/b/isbn/9780140448078-L.jpg', wid('Dead Souls', 'Nikolai Gogol')],
        ['We', 'Yevgeny Zamyatin', '9780140185852', 'English', 'Penguin Classics', 1993, 'https://covers.openlibrary.org/b/isbn/9780140185852-L.jpg', wid('We', 'Yevgeny Zamyatin')],
        ['My', 'Evgeniy Zamyatin', null, 'Russian', 'Azbuka', 2008, null, wid('We', 'Yevgeny Zamyatin')],
        ['Doctor Zhivago', 'Boris Pasternak', '9780375408694', 'English', 'Pantheon', 1958, 'https://covers.openlibrary.org/b/isbn/9780375408694-L.jpg', wid('Doctor Zhivago', 'Boris Pasternak')],
        ['The Trial', 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1999, 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', wid('The Trial', 'Franz Kafka')],
        ['The Metamorphosis', 'Franz Kafka', '9780553213690', 'English', 'Bantam', 1972, 'https://covers.openlibrary.org/b/isbn/9780553213690-L.jpg', wid('The Metamorphosis', 'Franz Kafka')],
        ['Siddhartha', 'Hermann Hesse', '9780553208849', 'English', 'Bantam', 1951, 'https://covers.openlibrary.org/b/isbn/9780553208849-L.jpg', wid('Siddhartha', 'Hermann Hesse')],
        ['Steppenwolf', 'Hermann Hesse', '9780312278908', 'English', 'Picador', 2002, 'https://covers.openlibrary.org/b/isbn/9780312278908-L.jpg', wid('Steppenwolf', 'Hermann Hesse')],
        ['The Magic Mountain', 'Thomas Mann', '9780679772873', 'English', 'Vintage', 1996, 'https://covers.openlibrary.org/b/isbn/9780679772873-L.jpg', wid('The Magic Mountain', 'Thomas Mann')],
        ['Death in Venice', 'Thomas Mann', '9780679722068', 'English', 'Vintage', 1989, 'https://covers.openlibrary.org/b/isbn/9780679722068-L.jpg', wid('Death in Venice', 'Thomas Mann')],
        ['The Tin Drum', 'Gunter Grass', '9780156900430', 'English', 'Harvest', 1989, 'https://covers.openlibrary.org/b/isbn/9780156900430-L.jpg', wid('The Tin Drum', 'Gunter Grass')],
        ['Faust', 'Johann Wolfgang von Goethe', '9780140440201', 'English', 'Penguin Classics', 2005, 'https://covers.openlibrary.org/b/isbn/9780140440201-L.jpg', wid('Faust', 'Johann Wolfgang von Goethe')],
        ['Madame Bovary', 'Gustave Flaubert', '9780143136019', 'English', 'Penguin Classics', 2011, 'https://covers.openlibrary.org/b/isbn/9780143136019-L.jpg', wid('Madame Bovary', 'Gustave Flaubert')],
        ['Madame Bovary', 'Gustave Flaubert', '9782070413119', 'French', 'Gallimard', 1972, null, wid('Madame Bovary', 'Gustave Flaubert')],
        ['Les Miserables', 'Victor Hugo', '9780140444308', 'English', 'Penguin Classics', 1987, 'https://covers.openlibrary.org/b/isbn/9780140444308-L.jpg', wid('Les Miserables', 'Victor Hugo')],
        ['Les Miserables', 'Victor Hugo', '9782070409228', 'French', 'Gallimard', 2000, null, wid('Les Miserables', 'Victor Hugo')],
        ['The Count of Monte Cristo', 'Alexandre Dumas', '9780140449266', 'English', 'Penguin Classics', 1996, 'https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg', wid('The Count of Monte Cristo', 'Alexandre Dumas')],
        ['Swann\'s Way', 'Marcel Proust', '9780142437964', 'English', 'Penguin Classics', 2004, 'https://covers.openlibrary.org/b/isbn/9780142437964-L.jpg', wid('Swann\'s Way', 'Marcel Proust')],
        ['Nausea', 'Jean-Paul Sartre', '9780811201224', 'English', 'New Directions', 1964, 'https://covers.openlibrary.org/b/isbn/9780811201224-L.jpg', wid('Nausea', 'Jean-Paul Sartre')],
        ['The Plague', 'Albert Camus', '9780679720218', 'English', 'Vintage', 1991, 'https://covers.openlibrary.org/b/isbn/9780679720218-L.jpg', wid('The Plague', 'Albert Camus')],
        ['Waiting for Godot', 'Samuel Beckett', '9780802130341', 'English', 'Grove Press', 1954, 'https://covers.openlibrary.org/b/isbn/9780802130341-L.jpg', wid('Waiting for Godot', 'Samuel Beckett')],
        ['Journey to the End of the Night', 'Louis-Ferdinand Celine', '9780811201889', 'English', 'New Directions', 1983, 'https://covers.openlibrary.org/b/isbn/9780811201889-L.jpg', wid('Journey to the End of the Night', 'Louis-Ferdinand Celine')],
        ['The Little Prince', 'Antoine de Saint-Exupery', '9780156012195', 'English', 'Harvest', 2000, 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg', wid('The Little Prince', 'Antoine de Saint-Exupery')],
        ['Le Petit Prince', 'Antoine de Saint-Exupery', '9782070408504', 'French', 'Gallimard', 1993, null, wid('The Little Prince', 'Antoine de Saint-Exupery')],
        ['Love in the Time of Cholera', 'Gabriel Garcia Marquez', '9780140157741', 'English', 'Penguin', 1989, 'https://covers.openlibrary.org/b/isbn/9780140157741-L.jpg', wid('Love in the Time of Cholera', 'Gabriel Garcia Marquez')],
        ['Ficciones', 'Jorge Luis Borges', '9780802130303', 'English', 'Grove Press', 1994, 'https://covers.openlibrary.org/b/isbn/9780802130303-L.jpg', wid('Ficciones', 'Jorge Luis Borges')],
        ['Pedro Paramo', 'Juan Rulfo', '9780802144904', 'English', 'Grove Press', 1994, 'https://covers.openlibrary.org/b/isbn/9780802144904-L.jpg', wid('Pedro Paramo', 'Juan Rulfo')],
        ['The House of the Spirits', 'Isabel Allende', '9781501117015', 'English', 'Atria', 2015, 'https://covers.openlibrary.org/b/isbn/9781501117015-L.jpg', wid('The House of the Spirits', 'Isabel Allende')],
        ['Blindness', 'Jose Saramago', '9780156007757', 'English', 'Harvest', 1999, 'https://covers.openlibrary.org/b/isbn/9780156007757-L.jpg', wid('Blindness', 'Jose Saramago')],
        ['The Book of Disquiet', 'Fernando Pessoa', '9780141183046', 'English', 'Penguin Classics', 2002, 'https://covers.openlibrary.org/b/isbn/9780141183046-L.jpg', wid('The Book of Disquiet', 'Fernando Pessoa')],
        ['If on a winter\'s night a traveler', 'Italo Calvino', '9780156439619', 'English', 'Harvest', 1982, 'https://covers.openlibrary.org/b/isbn/9780156439619-L.jpg', wid('If on a winter\'s night a traveler', 'Italo Calvino')],
        ['The Name of the Rose', 'Umberto Eco', '9780156001311', 'English', 'Harvest', 2004, 'https://covers.openlibrary.org/b/isbn/9780156001311-L.jpg', wid('The Name of the Rose', 'Umberto Eco')],
        ['The Leopard', 'Giuseppe Tomasi di Lampedusa', '9780375714566', 'English', 'Pantheon', 2007, 'https://covers.openlibrary.org/b/isbn/9780375714566-L.jpg', wid('The Leopard', 'Giuseppe Tomasi di Lampedusa')],
        ['Snow Country', 'Yasunari Kawabata', '9780679761051', 'English', 'Vintage', 1996, 'https://covers.openlibrary.org/b/isbn/9780679761051-L.jpg', wid('Snow Country', 'Yasunari Kawabata')],
        ['Yukiguni', 'Kawabata Yasunari', null, 'Japanese', 'Shinchosha', 1948, null, wid('Snow Country', 'Yasunari Kawabata')],
        ['No Longer Human', 'Osamu Dazai', '9780811204811', 'English', 'New Directions', 1958, 'https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg', wid('No Longer Human', 'Osamu Dazai')],
        ['The Sound of Waves', 'Yukio Mishima', '9780679752684', 'English', 'Vintage', 1994, 'https://covers.openlibrary.org/b/isbn/9780679752684-L.jpg', wid('The Sound of Waves', 'Yukio Mishima')],
        ['1Q84', 'Haruki Murakami', '9780307593313', 'English', 'Knopf', 2011, 'https://covers.openlibrary.org/b/isbn/9780307593313-L.jpg', wid('1Q84', 'Haruki Murakami')],
        ['The Wind-Up Bird Chronicle', 'Haruki Murakami', '9780679775430', 'English', 'Vintage', 1998, 'https://covers.openlibrary.org/b/isbn/9780679775430-L.jpg', wid('The Wind-Up Bird Chronicle', 'Haruki Murakami')],
        ['Silence', 'Shusaku Endo', '9780312422608', 'English', 'Picador', 2016, 'https://covers.openlibrary.org/b/isbn/9780312422608-L.jpg', wid('Silence', 'Shusaku Endo')],
        ['Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa', '9780140449709', 'English', 'Penguin Classics', 2006, 'https://covers.openlibrary.org/b/isbn/9780140449709-L.jpg', wid('Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa')],
        ['Dream of the Red Chamber', 'Cao Xueqin', '9780140443714', 'English', 'Penguin Classics', 1973, 'https://covers.openlibrary.org/b/isbn/9780140443714-L.jpg', wid('Dream of the Red Chamber', 'Cao Xueqin')],
        ['Monkey: A Folk Novel of China', 'Wu Cheng-en', '9780802150219', 'English', 'Grove Press', 1994, 'https://covers.openlibrary.org/b/isbn/9780802150219-L.jpg', wid('Journey to the West', 'Wu Cheng-en')],
        ['The Iliad (trans. Robert Fagles)', 'Homer', '9780140447940', 'English', 'Penguin Classics', 1998, 'https://covers.openlibrary.org/b/isbn/9780140447940-L.jpg', wid('The Iliad', 'Homer')],
        ['The Iliad (trans. Emily Wilson)', 'Homer', '9780393246414', 'English', 'Norton', 2023, 'https://covers.openlibrary.org/b/isbn/9780393246414-L.jpg', wid('The Iliad', 'Homer')],
        ['The Odyssey (trans. Emily Wilson)', 'Homer', '9780393246025', 'English', 'Norton', 2018, 'https://covers.openlibrary.org/b/isbn/9780393246025-L.jpg', wid('The Odyssey', 'Homer')],
        ['The Odyssey (trans. Robert Fitzgerald)', 'Homer', '9780374525743', 'English', 'Farrar Straus Giroux', 1998, 'https://covers.openlibrary.org/b/isbn/9780374525743-L.jpg', wid('The Odyssey', 'Homer')],
        ['The Aeneid (trans. Robert Fagles)', 'Virgil', '9780670038176', 'English', 'Viking', 2006, 'https://covers.openlibrary.org/b/isbn/9780670038176-L.jpg', wid('The Aeneid', 'Virgil')],
        ['The Republic', 'Plato', '9780140455113', 'English', 'Penguin Classics', 2007, 'https://covers.openlibrary.org/b/isbn/9780140455113-L.jpg', wid('The Republic', 'Plato')],
        ['The Art of War', 'Sun Tzu', '9780199540174', 'English', 'Oxford', 2008, 'https://covers.openlibrary.org/b/isbn/9780199540174-L.jpg', wid('The Art of War', 'Sun Tzu')],
        ['Tao Te Ching', 'Lao Tzu', '9780140441314', 'English', 'Penguin Classics', 1963, 'https://covers.openlibrary.org/b/isbn/9780140441314-L.jpg', wid('Tao Te Ching', 'Lao Tzu')],
        ['The Analects', 'Confucius', '9780140443486', 'English', 'Penguin Classics', 1979, 'https://covers.openlibrary.org/b/isbn/9780140443486-L.jpg', wid('The Analects', 'Confucius')],
        ['Bhagavad Gita', 'Vyasa', '9780140449181', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780140449181-L.jpg', wid('Bhagavad Gita', 'Vyasa')],
        ['Beowulf (trans. Seamus Heaney)', 'Anonymous', '9780393320978', 'English', 'Norton', 2001, 'https://covers.openlibrary.org/b/isbn/9780393320978-L.jpg', wid('Beowulf', 'Anonymous')],
        ['The Canterbury Tales', 'Geoffrey Chaucer', '9780140422344', 'English', 'Penguin Classics', 1951, 'https://covers.openlibrary.org/b/isbn/9780140422344-L.jpg', wid('The Canterbury Tales', 'Geoffrey Chaucer')],
        ['The Decameron', 'Giovanni Boccaccio', '9780140449303', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780140449303-L.jpg', wid('The Decameron', 'Giovanni Boccaccio')],
        ['Paradise Lost', 'John Milton', '9780140424393', 'English', 'Penguin Classics', 2000, 'https://covers.openlibrary.org/b/isbn/9780140424393-L.jpg', wid('Paradise Lost', 'John Milton')],
        ['Candide', 'Voltaire', '9780140440041', 'English', 'Penguin Classics', 1947, 'https://covers.openlibrary.org/b/isbn/9780140440041-L.jpg', wid('Candide', 'Voltaire')],
        ['Candide', 'Voltaire', '9782070360246', 'French', 'Gallimard', 1992, null, wid('Candide', 'Voltaire')],
        ['Robinson Crusoe', 'Daniel Defoe', '9780141439822', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780141439822-L.jpg', wid('Robinson Crusoe', 'Daniel Defoe')],
        ['Pride and Prejudice', 'Jane Austen', '9780141439518', 'English', 'Penguin Classics', 2002, 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg', wid('Pride and Prejudice', 'Jane Austen')],
        ['Jane Eyre', 'Charlotte Bronte', '9780141441146', 'English', 'Penguin Classics', 2006, 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg', wid('Jane Eyre', 'Charlotte Bronte')],
        ['Wuthering Heights', 'Emily Bronte', '9780141439556', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780141439556-L.jpg', wid('Wuthering Heights', 'Emily Bronte')],
        ['Great Expectations', 'Charles Dickens', '9780141439563', 'English', 'Penguin Classics', 2002, 'https://covers.openlibrary.org/b/isbn/9780141439563-L.jpg', wid('Great Expectations', 'Charles Dickens')],
        ['Moby-Dick', 'Herman Melville', '9780142437247', 'English', 'Penguin Classics', 2002, 'https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg', wid('Moby-Dick', 'Herman Melville')],
        ['Moby-Dick (Norton Critical Edition)', 'Herman Melville', '9780393972832', 'English', 'Norton', 2001, 'https://covers.openlibrary.org/b/isbn/9780393972832-L.jpg', wid('Moby-Dick', 'Herman Melville')],
        ['The Scarlet Letter', 'Nathaniel Hawthorne', '9780142437261', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780142437261-L.jpg', wid('The Scarlet Letter', 'Nathaniel Hawthorne')],
        ['Adventures of Huckleberry Finn', 'Mark Twain', '9780142437179', 'English', 'Penguin Classics', 2002, 'https://covers.openlibrary.org/b/isbn/9780142437179-L.jpg', wid('Adventures of Huckleberry Finn', 'Mark Twain')],
        ['Dracula', 'Bram Stoker', '9780141439846', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780141439846-L.jpg', wid('Dracula', 'Bram Stoker')],
        ['The Picture of Dorian Gray', 'Oscar Wilde', '9780141442464', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/isbn/9780141442464-L.jpg', wid('The Picture of Dorian Gray', 'Oscar Wilde')],
        ['Ulysses', 'James Joyce', '9780394743127', 'English', 'Vintage', 1990, 'https://covers.openlibrary.org/b/isbn/9780394743127-L.jpg', wid('Ulysses', 'James Joyce')],
        ['Mrs Dalloway', 'Virginia Woolf', '9780156628709', 'English', 'Harvest', 1981, 'https://covers.openlibrary.org/b/isbn/9780156628709-L.jpg', wid('Mrs Dalloway', 'Virginia Woolf')],
        ['Animal Farm', 'George Orwell', '9780451526342', 'English', 'Signet Classics', 1966, 'https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg', wid('Animal Farm', 'George Orwell')],
        ['Brave New World', 'Aldous Huxley', '9780060850524', 'English', 'Harper Perennial', 2006, 'https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg', wid('Brave New World', 'Aldous Huxley')],
        ['Lord of the Flies', 'William Golding', '9780399501487', 'English', 'Perigee', 2011, 'https://covers.openlibrary.org/b/isbn/9780399501487-L.jpg', wid('Lord of the Flies', 'William Golding')],
        ['A Clockwork Orange', 'Anthony Burgess', '9780393312836', 'English', 'Norton', 2012, 'https://covers.openlibrary.org/b/isbn/9780393312836-L.jpg', wid('A Clockwork Orange', 'Anthony Burgess')],
        ['The Great Gatsby', 'F. Scott Fitzgerald', '9780743273565', 'English', 'Scribner', 2004, 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg', wid('The Great Gatsby', 'F. Scott Fitzgerald')],
        ['The Sound and the Fury', 'William Faulkner', '9780679732242', 'English', 'Vintage', 1990, 'https://covers.openlibrary.org/b/isbn/9780679732242-L.jpg', wid('The Sound and the Fury', 'William Faulkner')],
        ['To Kill a Mockingbird', 'Harper Lee', '9780061935466', 'English', 'Harper Perennial', 2002, 'https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg', wid('To Kill a Mockingbird', 'Harper Lee')],
        ['The Grapes of Wrath', 'John Steinbeck', '9780143039433', 'English', 'Penguin Classics', 2006, 'https://covers.openlibrary.org/b/isbn/9780143039433-L.jpg', wid('The Grapes of Wrath', 'John Steinbeck')],
        ['East of Eden', 'John Steinbeck', '9780142004234', 'English', 'Penguin', 2002, 'https://covers.openlibrary.org/b/isbn/9780142004234-L.jpg', wid('East of Eden', 'John Steinbeck')],
        ['Catch-22', 'Joseph Heller', '9781451626650', 'English', 'Simon and Schuster', 2011, 'https://covers.openlibrary.org/b/isbn/9781451626650-L.jpg', wid('Catch-22', 'Joseph Heller')],
        ['Slaughterhouse-Five', 'Kurt Vonnegut', '9780440180296', 'English', 'Dell', 1991, 'https://covers.openlibrary.org/b/isbn/9780440180296-L.jpg', wid('Slaughterhouse-Five', 'Kurt Vonnegut')],
        ['The Catcher in the Rye', 'J.D. Salinger', '9780316769174', 'English', 'Little Brown', 2001, 'https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg', wid('The Catcher in the Rye', 'J.D. Salinger')],
        ['On the Road', 'Jack Kerouac', '9780140283297', 'English', 'Penguin', 1999, 'https://covers.openlibrary.org/b/isbn/9780140283297-L.jpg', wid('On the Road', 'Jack Kerouac')],
        ['Beloved', 'Toni Morrison', '9781400033416', 'English', 'Vintage', 2004, 'https://covers.openlibrary.org/b/isbn/9781400033416-L.jpg', wid('Beloved', 'Toni Morrison')],
        ['The Road', 'Cormac McCarthy', '9780307387899', 'English', 'Vintage', 2007, 'https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg', wid('The Road', 'Cormac McCarthy')],
        ['The Hobbit', 'J.R.R. Tolkien', '9780547928227', 'English', 'Houghton Mifflin Harcourt', 2012, 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg', wid('The Hobbit', 'J.R.R. Tolkien')],
        ['The Fellowship of the Ring', 'J.R.R. Tolkien', '9780618574940', 'English', 'Houghton Mifflin Harcourt', 2004, 'https://covers.openlibrary.org/b/isbn/9780618574940-L.jpg', wid('The Fellowship of the Ring', 'J.R.R. Tolkien')],
        ['Foundation', 'Isaac Asimov', '9780553293357', 'English', 'Spectra', 1991, 'https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg', wid('Foundation', 'Isaac Asimov')],
        ['Fahrenheit 451', 'Ray Bradbury', '9781451673319', 'English', 'Simon and Schuster', 2012, 'https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg', wid('Fahrenheit 451', 'Ray Bradbury')],
        ['Neuromancer', 'William Gibson', '9780441569595', 'English', 'Ace', 1986, 'https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg', wid('Neuromancer', 'William Gibson')],
        ['Do Androids Dream of Electric Sheep?', 'Philip K. Dick', '9780345404473', 'English', 'Del Rey', 1996, 'https://covers.openlibrary.org/b/isbn/9780345404473-L.jpg', wid('Do Androids Dream of Electric Sheep?', 'Philip K. Dick')],
        ['The Hitchhiker\'s Guide to the Galaxy', 'Douglas Adams', '9780345391803', 'English', 'Del Rey', 1995, 'https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg', wid('The Hitchhiker\'s Guide to the Galaxy', 'Douglas Adams')],
        ['On the Origin of Species', 'Charles Darwin', '9780140432053', 'English', 'Penguin Classics', 1985, 'https://covers.openlibrary.org/b/isbn/9780140432053-L.jpg', wid('On the Origin of Species', 'Charles Darwin')],
        ['Man\'s Search for Meaning', 'Viktor Frankl', '9780807014271', 'English', 'Beacon Press', 2006, 'https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg', wid('Man\'s Search for Meaning', 'Viktor Frankl')],
        ['The Diary of a Young Girl', 'Anne Frank', '9780553296983', 'English', 'Bantam', 1993, 'https://covers.openlibrary.org/b/isbn/9780553296983-L.jpg', wid('The Diary of a Young Girl', 'Anne Frank')],
        ['Night', 'Elie Wiesel', '9780374500016', 'English', 'Hill and Wang', 2006, 'https://covers.openlibrary.org/b/isbn/9780374500016-L.jpg', wid('Night', 'Elie Wiesel')],
        ['In Cold Blood', 'Truman Capote', '9780679745587', 'English', 'Vintage', 1994, 'https://covers.openlibrary.org/b/isbn/9780679745587-L.jpg', wid('In Cold Blood', 'Truman Capote')],
        ['The Remains of the Day', 'Kazuo Ishiguro', '9780679731726', 'English', 'Vintage', 1990, 'https://covers.openlibrary.org/b/isbn/9780679731726-L.jpg', wid('The Remains of the Day', 'Kazuo Ishiguro')],
        ['Never Let Me Go', 'Kazuo Ishiguro', '9781400078776', 'English', 'Vintage', 2006, 'https://covers.openlibrary.org/b/isbn/9781400078776-L.jpg', wid('Never Let Me Go', 'Kazuo Ishiguro')],
        ['The Kite Runner', 'Khaled Hosseini', '9781594631931', 'English', 'Riverhead', 2004, 'https://covers.openlibrary.org/b/isbn/9781594631931-L.jpg', wid('The Kite Runner', 'Khaled Hosseini')],
        ['Life of Pi', 'Yann Martel', '9780156027328', 'English', 'Harvest', 2003, 'https://covers.openlibrary.org/b/isbn/9780156027328-L.jpg', wid('Life of Pi', 'Yann Martel')],
        ['Midnight\'s Children', 'Salman Rushdie', '9780812976533', 'English', 'Random House', 2006, 'https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg', wid('Midnight\'s Children', 'Salman Rushdie')],
        ['The God of Small Things', 'Arundhati Roy', '9780679457312', 'English', 'Random House', 1997, 'https://covers.openlibrary.org/b/isbn/9780679457312-L.jpg', wid('The God of Small Things', 'Arundhati Roy')],
        ['Gitanjali', 'Rabindranath Tagore', '9780333902981', 'English', 'Macmillan', 1913, 'https://covers.openlibrary.org/b/isbn/9780333902981-L.jpg', wid('Gitanjali', 'Rabindranath Tagore')],
        ['Season of Migration to the North', 'Tayeb Salih', '9780894108501', 'English', 'NYRB Classics', 2009, 'https://covers.openlibrary.org/b/isbn/9780894108501-L.jpg', wid('Season of Migration to the North', 'Tayeb Salih')],
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

      const demoPassword = process.env.DEMO_PASSWORD || crypto.randomBytes(10).toString('base64url').slice(0, 14) + '!D1';
      const demoHash = await bcrypt.hash(demoPassword, 12);
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
