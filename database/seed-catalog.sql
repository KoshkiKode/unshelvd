-- ============================================================
-- Unshelv'd — Catalog Seed Data
-- PostgreSQL (Amazon Aurora compatible)
--
-- Inserts the starter works and book catalog entries.
-- Run AFTER schema.sql. Safe to re-run (ON CONFLICT DO NOTHING).
--
-- Usage (psql):
--   psql "postgresql://USER:PASSWORD@YOUR-AURORA-ENDPOINT:5432/unshelvd" -f seed-catalog.sql
-- ============================================================

-- ── Works (abstract literary creations) ──────────────────────────────────────

INSERT INTO works (title, author, original_language, first_published_year, genre, cover_url, source, verified) VALUES
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari',              'Hebrew',        2011, 'Non-Fiction,History',     'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', 'manual', true),
  ('Meditations',                           'Marcus Aurelius',                 'Ancient Greek',  180, 'Philosophy',              'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', 'manual', true),
  ('Blood Meridian',                        'Cormac McCarthy',                 'English',        1985, 'Fiction',                 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', 'manual', true),
  ('Dune',                                  'Frank Herbert',                   'English',        1965, 'Sci-Fi,Fiction',          'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', 'manual', true),
  ('Kafka on the Shore',                    'Haruki Murakami',                 'Japanese',       2002, 'Fiction',                 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', 'manual', true),
  ('The Stranger',                          'Albert Camus',                    'French',         1942, 'Fiction,Philosophy',      'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', 'manual', true),
  ('Norwegian Wood',                        'Haruki Murakami',                 'Japanese',       1987, 'Fiction',                 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', 'manual', true),
  ('House of Leaves',                       'Mark Z. Danielewski',             'English',        2000, 'Fiction,Horror',          'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', 'manual', true),
  ('The Brothers Karamazov',                'Fyodor Dostoevsky',               'Russian',        1880, 'Fiction',                 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', 'manual', true),
  ('The Master and Margarita',              'Mikhail Bulgakov',                'Russian',        1967, 'Fiction,Fantasy',         'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', 'manual', true),
  ('Roadside Picnic',                       'Arkady and Boris Strugatsky',     'Russian',        1972, 'Sci-Fi',                  'https://covers.openlibrary.org/b/id/8443792-L.jpg',         'manual', true),
  ('Crime and Punishment',                  'Fyodor Dostoevsky',               'Russian',        1866, 'Fiction',                 'https://covers.openlibrary.org/b/id/8479260-L.jpg',         'manual', true),
  ('War and Peace',                         'Leo Tolstoy',                     'Russian',        1869, 'Fiction,History',         'https://covers.openlibrary.org/b/id/8228691-L.jpg',         'manual', true),
  ('The Bridge on the Drina',               'Ivo Andrić',                      'Serbian',        1945, 'Fiction,History',         'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', 'manual', true),
  ('Death and the Dervish',                 'Meša Selimović',                  'Bosnian',        1966, 'Fiction,Philosophy',      'https://covers.openlibrary.org/b/id/13127483-L.jpg',        'manual', true),
  ('The Damned Yard',                       'Ivo Andrić',                      'Serbian',        1954, 'Fiction',                 'https://covers.openlibrary.org/b/id/8394082-L.jpg',         'manual', true),
  ('A Brief History of Time',               'Stephen Hawking',                 'English',        1988, 'Non-Fiction,Science',     'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', 'manual', true),
  ('1984',                                  'George Orwell',                   'English',        1949, 'Fiction,Sci-Fi',          'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', 'manual', true),
  ('The Left Hand of Darkness',             'Ursula K. Le Guin',               'English',        1969, 'Sci-Fi',                  'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', 'manual', true),
  ('The Diaries of Franz Kafka',            'Franz Kafka',                     'German',         1948, 'Non-Fiction,Biography',   'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'manual', true),
  ('One Hundred Years of Solitude',         'Gabriel García Márquez',          'Spanish',        1967, 'Fiction',                 'https://covers.openlibrary.org/b/id/8411716-L.jpg',         'manual', true),
  ('Don Quixote',                           'Miguel de Cervantes',             'Spanish',        1605, 'Fiction',                 'https://covers.openlibrary.org/b/id/8416816-L.jpg',         'manual', true),
  ('Things Fall Apart',                     'Chinua Achebe',                   'English',        1958, 'Fiction',                 'https://covers.openlibrary.org/b/id/8468612-L.jpg',         'manual', true),
  ('The Divine Comedy',                     'Dante Alighieri',                 'Italian',        1320, 'Poetry,Fiction',          'https://covers.openlibrary.org/b/id/8470260-L.jpg',         'manual', true),
  ('Hamlet',                                'William Shakespeare',             'English',        1603, 'Fiction,Drama',           'https://covers.openlibrary.org/b/id/8471820-L.jpg',         'manual', true)
ON CONFLICT DO NOTHING;

-- ── Book Catalog (specific editions) ─────────────────────────────────────────

INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, cover_url, work_id, source, verified) VALUES
  -- Sapiens
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'English', 'Harper',   2015, 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', (SELECT id FROM works WHERE title='Sapiens: A Brief History of Humankind' AND author='Yuval Noah Harari'), 'manual', true),
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780099590088', 'English', 'Vintage',  2015, 'https://covers.openlibrary.org/b/isbn/9780099590088-L.jpg', (SELECT id FROM works WHERE title='Sapiens: A Brief History of Humankind' AND author='Yuval Noah Harari'), 'manual', true),
  -- Meditations
  ('Meditations', 'Marcus Aurelius', '9780140449334', 'English', 'Penguin Classics', 2006, 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', (SELECT id FROM works WHERE title='Meditations' AND author='Marcus Aurelius'), 'manual', true),
  ('Meditations', 'Marcus Aurelius', '9780486298238', 'English', 'Dover',             1997, 'https://covers.openlibrary.org/b/isbn/9780486298238-L.jpg', (SELECT id FROM works WHERE title='Meditations' AND author='Marcus Aurelius'), 'manual', true),
  -- Blood Meridian
  ('Blood Meridian, or the Evening Redness in the West', 'Cormac McCarthy', '9780679728757', 'English', 'Vintage', 1992, 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', (SELECT id FROM works WHERE title='Blood Meridian' AND author='Cormac McCarthy'), 'manual', true),
  -- Dune
  ('Dune', 'Frank Herbert', '9780441172719', 'English', 'Ace', 1990, 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', (SELECT id FROM works WHERE title='Dune' AND author='Frank Herbert'), 'manual', true),
  ('Dune', 'Frank Herbert', '9780593099322', 'English', 'Ace', 2019, 'https://covers.openlibrary.org/b/id/13186889-L.jpg',         (SELECT id FROM works WHERE title='Dune' AND author='Frank Herbert'), 'manual', true),
  -- Kafka on the Shore
  ('Kafka on the Shore', 'Haruki Murakami', '9781400079278', 'English', 'Vintage', 2005, 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', (SELECT id FROM works WHERE title='Kafka on the Shore' AND author='Haruki Murakami'), 'manual', true),
  -- The Stranger
  ('The Stranger',  'Albert Camus', '9780679720201', 'English', 'Vintage',    1989, 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', (SELECT id FROM works WHERE title='The Stranger' AND author='Albert Camus'), 'manual', true),
  ('L''Étranger',   'Albert Camus', '9782070360024', 'French',  'Gallimard',  1971, 'https://covers.openlibrary.org/b/id/8408558-L.jpg',         (SELECT id FROM works WHERE title='The Stranger' AND author='Albert Camus'), 'manual', true),
  -- Norwegian Wood
  ('Norwegian Wood', 'Haruki Murakami', '9780375704024', 'English', 'Vintage', 2000, 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', (SELECT id FROM works WHERE title='Norwegian Wood' AND author='Haruki Murakami'), 'manual', true),
  -- House of Leaves
  ('House of Leaves', 'Mark Z. Danielewski', '9780375703768', 'English', 'Pantheon', 2000, 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', (SELECT id FROM works WHERE title='House of Leaves' AND author='Mark Z. Danielewski'), 'manual', true),
  -- The Brothers Karamazov
  ('The Brothers Karamazov',    'Fyodor Dostoevsky',  '9780374528379', 'English', 'Farrar, Straus and Giroux', 2002, 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', (SELECT id FROM works WHERE title='The Brothers Karamazov' AND author='Fyodor Dostoevsky'), 'manual', true),
  ('Братья Карамазовы',         'Фёдор Достоевский',  '9785699015832', 'Russian', 'Eksmo',                    2008, 'https://covers.openlibrary.org/b/id/8409928-L.jpg',         (SELECT id FROM works WHERE title='The Brothers Karamazov' AND author='Fyodor Dostoevsky'), 'manual', true),
  -- The Master and Margarita
  ('The Master and Margarita',  'Mikhail Bulgakov',   '9780141180144', 'English', 'Penguin Classics', 1997, 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', (SELECT id FROM works WHERE title='The Master and Margarita' AND author='Mikhail Bulgakov'), 'manual', true),
  ('Мастер и Маргарита',        'Михаил Булгаков',    '9785170977871', 'Russian', 'AST',              2019, 'https://covers.openlibrary.org/b/isbn/9785170977871-L.jpg', (SELECT id FROM works WHERE title='The Master and Margarita' AND author='Mikhail Bulgakov'), 'manual', true),
  -- Roadside Picnic
  ('Roadside Picnic',     'Arkady and Boris Strugatsky',  '9781613743416', 'English', 'Chicago Review Press', 2012, 'https://covers.openlibrary.org/b/id/8443792-L.jpg', (SELECT id FROM works WHERE title='Roadside Picnic' AND author='Arkady and Boris Strugatsky'), 'manual', true),
  ('Пикник на обочине',   'Аркадий и Борис Стругацкие',  NULL,            'Russian', 'Молодая гвардия',       1972, NULL,                                                  (SELECT id FROM works WHERE title='Roadside Picnic' AND author='Arkady and Boris Strugatsky'), 'manual', true),
  -- Crime and Punishment
  ('Crime and Punishment',          'Fyodor Dostoevsky', '9780143058144', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/id/8479260-L.jpg', (SELECT id FROM works WHERE title='Crime and Punishment' AND author='Fyodor Dostoevsky'), 'manual', true),
  ('Преступление и наказание',      'Фёдор Достоевский', NULL,            'Russian', 'Eksmo',            2005, NULL,                                                 (SELECT id FROM works WHERE title='Crime and Punishment' AND author='Fyodor Dostoevsky'), 'manual', true),
  -- War and Peace
  ('War and Peace',   'Leo Tolstoy',  '9780140447934', 'English', 'Penguin Classics', 1982, 'https://covers.openlibrary.org/b/id/8228691-L.jpg', (SELECT id FROM works WHERE title='War and Peace' AND author='Leo Tolstoy'), 'manual', true),
  ('Война и мир',     'Лев Толстой',  NULL,            'Russian', 'Азбука',           2012, NULL,                                                 (SELECT id FROM works WHERE title='War and Peace' AND author='Leo Tolstoy'), 'manual', true),
  -- The Bridge on the Drina
  ('The Bridge on the Drina',  'Ivo Andrić', '9780226020457', 'English', 'University of Chicago Press', 1977, 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', (SELECT id FROM works WHERE title='The Bridge on the Drina' AND author='Ivo Andrić'), 'manual', true),
  ('Na Drini ćuprija',         'Ivo Andrić', '9788652118038', 'Serbian', 'Prosveta',                    1945, 'https://covers.openlibrary.org/b/isbn/9788652118038-L.jpg', (SELECT id FROM works WHERE title='The Bridge on the Drina' AND author='Ivo Andrić'), 'manual', true),
  -- Death and the Dervish
  ('Death and the Dervish',    'Meša Selimović', '9780810112384', 'English', 'Northwestern University Press', 1996, 'https://covers.openlibrary.org/b/id/13127483-L.jpg', (SELECT id FROM works WHERE title='Death and the Dervish' AND author='Meša Selimović'), 'manual', true),
  ('Derviš i smrt',            'Meša Selimović', NULL,            'Bosnian', 'Svjetlost',                     1966, NULL,                                                  (SELECT id FROM works WHERE title='Death and the Dervish' AND author='Meša Selimović'), 'manual', true),
  -- The Damned Yard
  ('The Damned Yard',  'Ivo Andrić', NULL,  'English', 'Forest Books', 1992, NULL, (SELECT id FROM works WHERE title='The Damned Yard' AND author='Ivo Andrić'), 'manual', true),
  ('Prokleta avlija',  'Ivo Andrić', NULL,  'Serbian', 'Prosveta',     1954, NULL, (SELECT id FROM works WHERE title='The Damned Yard' AND author='Ivo Andrić'), 'manual', true),
  -- A Brief History of Time
  ('A Brief History of Time',                'Stephen Hawking', '9780553380163', 'English', 'Bantam', 1988, 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', (SELECT id FROM works WHERE title='A Brief History of Time' AND author='Stephen Hawking'), 'manual', true),
  ('A Brief History of Time (Updated Edition)', 'Stephen Hawking', '9780553804577', 'English', 'Bantam', 1998, 'https://covers.openlibrary.org/b/isbn/9780553804577-L.jpg', (SELECT id FROM works WHERE title='A Brief History of Time' AND author='Stephen Hawking'), 'manual', true),
  -- 1984
  ('1984',                 'George Orwell', '9780451524935', 'English', 'Signet Classics',          1950, 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', (SELECT id FROM works WHERE title='1984' AND author='George Orwell'), 'manual', true),
  ('Nineteen Eighty-Four', 'George Orwell', '9780141036144', 'English', 'Penguin Modern Classics',  2004, 'https://covers.openlibrary.org/b/isbn/9780141036144-L.jpg', (SELECT id FROM works WHERE title='1984' AND author='George Orwell'), 'manual', true),
  -- The Left Hand of Darkness
  ('The Left Hand of Darkness', 'Ursula K. Le Guin', '9780441478125', 'English', 'Ace', 1969, 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', (SELECT id FROM works WHERE title='The Left Hand of Darkness' AND author='Ursula K. Le Guin'), 'manual', true),
  -- The Diaries of Franz Kafka
  ('The Diaries of Franz Kafka',  'Franz Kafka', '9780805209068', 'English', 'Schocken',        1988, 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', (SELECT id FROM works WHERE title='The Diaries of Franz Kafka' AND author='Franz Kafka'), 'manual', true),
  ('Tagebücher',                  'Franz Kafka', NULL,            'German',  'S. Fischer Verlag', 1954, NULL,                                                      (SELECT id FROM works WHERE title='The Diaries of Franz Kafka' AND author='Franz Kafka'), 'manual', true),
  -- One Hundred Years of Solitude
  ('One Hundred Years of Solitude',  'Gabriel García Márquez', '9780060883287', 'English', 'Harper Perennial Modern Classics', 2006, 'https://covers.openlibrary.org/b/id/8411716-L.jpg', (SELECT id FROM works WHERE title='One Hundred Years of Solitude' AND author='Gabriel García Márquez'), 'manual', true),
  ('Cien años de soledad',           'Gabriel García Márquez', '9788497592208', 'Spanish', 'Cátedra',                          2007, NULL,                                                  (SELECT id FROM works WHERE title='One Hundred Years of Solitude' AND author='Gabriel García Márquez'), 'manual', true),
  -- Don Quixote
  ('Don Quixote',                                       'Miguel de Cervantes', '9780060934347', 'English', 'Harper Perennial Modern Classics', 2003, 'https://covers.openlibrary.org/b/id/8416816-L.jpg', (SELECT id FROM works WHERE title='Don Quixote' AND author='Miguel de Cervantes'), 'manual', true),
  ('El ingenioso hidalgo don Quijote de la Mancha',     'Miguel de Cervantes', NULL,            'Spanish', 'Real Academia Española',           2004, NULL,                                                  (SELECT id FROM works WHERE title='Don Quixote' AND author='Miguel de Cervantes'), 'manual', true),
  -- Things Fall Apart
  ('Things Fall Apart', 'Chinua Achebe', '9780385474542', 'English', 'Anchor', 1994, 'https://covers.openlibrary.org/b/id/8468612-L.jpg', (SELECT id FROM works WHERE title='Things Fall Apart' AND author='Chinua Achebe'), 'manual', true),
  -- The Divine Comedy
  ('The Divine Comedy',   'Dante Alighieri', '9780142437223', 'English', 'Penguin Classics', 2003, 'https://covers.openlibrary.org/b/id/8470260-L.jpg', (SELECT id FROM works WHERE title='The Divine Comedy' AND author='Dante Alighieri'), 'manual', true),
  ('La Divina Commedia',  'Dante Alighieri', NULL,            'Italian', 'Einaudi',           2014, NULL,                                                 (SELECT id FROM works WHERE title='The Divine Comedy' AND author='Dante Alighieri'), 'manual', true),
  -- Hamlet
  ('Hamlet', 'William Shakespeare', '9780743477123', 'English', 'Simon & Schuster', 2003, 'https://covers.openlibrary.org/b/id/8471820-L.jpg', (SELECT id FROM works WHERE title='Hamlet' AND author='William Shakespeare'), 'manual', true)
ON CONFLICT DO NOTHING;
