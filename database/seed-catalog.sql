-- ============================================================
-- Unshelv'd — Catalog Seed Data
-- PostgreSQL (Amazon Aurora compatible)
--
-- Inserts the starter works and book catalog entries.
-- Run AFTER schema.sql. Safe to re-run (ON CONFLICT DO NOTHING).
--
-- This file is the authoritative source for the initial catalog.
-- It is kept in sync with server/auto-seed.ts (which runs at startup)
-- and script/seed.js (which is used for manual seeding).
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
-- Each INSERT uses separate statements so individual failures don't block the rest.
-- All statements are safe to re-run (ON CONFLICT DO NOTHING on isbn_13 / open_library_id).

-- Sapiens
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '0062316095', '9780062316097', 'English', 'Hebrew', 'Harper',  2015, 2011, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', (SELECT id FROM works WHERE title='Sapiens: A Brief History of Humankind' AND author='Yuval Noah Harari'), 'manual', true),
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', NULL,         '9780099590088', 'English', 'Hebrew', 'Vintage', 2015, 2011, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780099590088-L.jpg', (SELECT id FROM works WHERE title='Sapiens: A Brief History of Humankind' AND author='Yuval Noah Harari'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Sapiens — Hebrew original edition (right-to-left)
INSERT INTO book_catalog (title, title_romanized, author, isbn_13, language, country_of_origin, script, text_direction, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('קיצור תולדות האנושות',
   'Kitsur Toldot HaEnoshut',
   'יובל נח הררי',
   '9789655601695', 'Hebrew', 'Israel', 'Hebrew (עברית)', 'rtl',
   'Dvir', 2011, 2011, 'Non-Fiction,History',
   'https://covers.openlibrary.org/b/id/7781014-L.jpg',
   (SELECT id FROM works WHERE title='Sapiens: A Brief History of Humankind' AND author='Yuval Noah Harari'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- Meditations
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Meditations', 'Marcus Aurelius', '0140449337', '9780140449334', 'English', 'Ancient Greek', 'Penguin Classics', 2006, 180, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', (SELECT id FROM works WHERE title='Meditations' AND author='Marcus Aurelius'), 'manual', true),
  ('Meditations', 'Marcus Aurelius', NULL,         '9780486298238', 'English', 'Ancient Greek', 'Dover',            1997, 180, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780486298238-L.jpg', (SELECT id FROM works WHERE title='Meditations' AND author='Marcus Aurelius'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Meditations — Ancient Greek original
INSERT INTO book_catalog (title, title_romanized, author, language, script, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('Τὰ εἰς ἑαυτόν', 'Ta eis heauton',
   'Μάρκος Αὐρήλιος',
   'Ancient Greek', 'Greek', 'Akademische Verlagsgesellschaft', 1960, 180, 'Philosophy',
   (SELECT id FROM works WHERE title='Meditations' AND author='Marcus Aurelius'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- Blood Meridian
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Blood Meridian, or the Evening Redness in the West', 'Cormac McCarthy', '0679728759', '9780679728757', 'English', 'Vintage', 1992, 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', (SELECT id FROM works WHERE title='Blood Meridian' AND author='Cormac McCarthy'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Dune
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Dune', 'Frank Herbert', '0441172717', '9780441172719', 'English', 'Ace', 1990, 1965, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', (SELECT id FROM works WHERE title='Dune' AND author='Frank Herbert'), 'manual', true),
  ('Dune', 'Frank Herbert', NULL,         '9780593099322', 'English', 'Ace', 2019, 1965, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/id/13186889-L.jpg',        (SELECT id FROM works WHERE title='Dune' AND author='Frank Herbert'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Kafka on the Shore
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Kafka on the Shore', 'Haruki Murakami', '1400079276', '9781400079278', 'English', 'Japanese', 'Vintage', 2005, 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', (SELECT id FROM works WHERE title='Kafka on the Shore' AND author='Haruki Murakami'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Kafka on the Shore — Japanese original
INSERT INTO book_catalog (title, title_romanized, author, isbn_13, language, script, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('海辺のカフカ', 'Umibe no Kafuka',
   '村上春樹',
   '9784101001616', 'Japanese', 'Japanese (Kanji 漢字)',
   'Shinchosha', 2005, 2002, 'Fiction',
   'https://covers.openlibrary.org/b/id/8471060-L.jpg',
   (SELECT id FROM works WHERE title='Kafka on the Shore' AND author='Haruki Murakami'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- The Stranger
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Stranger',  'Albert Camus', '0679720200', '9780679720201', 'English', 'French', 'Vintage',   1989, 1942, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', (SELECT id FROM works WHERE title='The Stranger' AND author='Albert Camus'), 'manual', true),
  ('L''Étranger', 'Albert Camus', NULL, '9782070360024', 'French', NULL, 'Gallimard', 1971, 1942, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/8408558-L.jpg', (SELECT id FROM works WHERE title='The Stranger' AND author='Albert Camus'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Norwegian Wood
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Norwegian Wood', 'Haruki Murakami', '0375704027', '9780375704024', 'English', 'Japanese', 'Vintage', 2000, 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', (SELECT id FROM works WHERE title='Norwegian Wood' AND author='Haruki Murakami'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Norwegian Wood — Japanese original
INSERT INTO book_catalog (title, title_romanized, author, isbn_13, language, script, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('ノルウェイの森', 'Noruwei no mori',
   '村上春樹',
   '9784062749497', 'Japanese', 'Japanese (Kanji 漢字)',
   'Kodansha', 2004, 1987, 'Fiction',
   (SELECT id FROM works WHERE title='Norwegian Wood' AND author='Haruki Murakami'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- House of Leaves
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('House of Leaves', 'Mark Z. Danielewski', '0375703764', '9780375703768', 'English', 'Pantheon', 2000, 2000, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', (SELECT id FROM works WHERE title='House of Leaves' AND author='Mark Z. Danielewski'), 'manual', true)
ON CONFLICT DO NOTHING;

-- The Brothers Karamazov
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Brothers Karamazov', 'Fyodor Dostoevsky', '0374528373', '9780374528379', 'English', 'Russian', 'Farrar, Straus and Giroux', 2002, 1880, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', (SELECT id FROM works WHERE title='The Brothers Karamazov' AND author='Fyodor Dostoevsky'), 'manual', true)
ON CONFLICT DO NOTHING;

INSERT INTO book_catalog (title, title_romanized, author, isbn_13, language, country_of_origin, script, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Братья Карамазовы', 'Bratya Karamazovy',
   'Фёдор Достоевский',
   '9785699015832', 'Russian', 'Russia', 'Cyrillic', 'Eksmo', 2008, 1880, 'Fiction',
   'https://covers.openlibrary.org/b/id/8409928-L.jpg',
   (SELECT id FROM works WHERE title='The Brothers Karamazov' AND author='Fyodor Dostoevsky'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- The Brothers Karamazov — German translation
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('Die Brüder Karamasow', 'Fjodor Dostojewski', '9783423124782', 'German', 'Russian', 'dtv', 1993, 1880, 'Fiction',
   (SELECT id FROM works WHERE title='The Brothers Karamazov' AND author='Fyodor Dostoevsky'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- The Master and Margarita
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Master and Margarita', 'Mikhail Bulgakov', '0141180145', '9780141180144', 'English', 'Russian', 'Penguin Classics', 1997, 1967, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', (SELECT id FROM works WHERE title='The Master and Margarita' AND author='Mikhail Bulgakov'), 'manual', true)
ON CONFLICT DO NOTHING;

INSERT INTO book_catalog (title, title_romanized, author, isbn_13, language, country_of_origin, script, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Мастер и Маргарита', 'Master i Margarita',
   'Михаил Булгаков',
   '9785170977871', 'Russian', 'USSR / Soviet Union', 'Cyrillic', 'AST', 2019, 1967, 'Fiction,Fantasy',
   'https://covers.openlibrary.org/b/isbn/9785170977871-L.jpg',
   (SELECT id FROM works WHERE title='The Master and Margarita' AND author='Mikhail Bulgakov'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- Roadside Picnic
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Roadside Picnic', 'Arkady and Boris Strugatsky', '9781613743416', 'English', 'Russian', 'Chicago Review Press', 2012, 1972, 'Sci-Fi', 'https://covers.openlibrary.org/b/id/8443792-L.jpg', (SELECT id FROM works WHERE title='Roadside Picnic' AND author='Arkady and Boris Strugatsky'), 'manual', true)
ON CONFLICT DO NOTHING;

INSERT INTO book_catalog (title, title_romanized, author, language, country_of_origin, script, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('Пикник на обочине', 'Piknik na obochine',
   'Аркадий и Борис Стругацкие',
   'Russian', 'USSR / Soviet Union', 'Cyrillic', 'Молодая гвардия', 1972, 1972, 'Sci-Fi',
   (SELECT id FROM works WHERE title='Roadside Picnic' AND author='Arkady and Boris Strugatsky'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- Crime and Punishment
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Crime and Punishment', 'Fyodor Dostoevsky', '9780143058144', 'English', 'Russian', 'Penguin Classics', 2003, 1866, 'Fiction', 'https://covers.openlibrary.org/b/id/8479260-L.jpg', (SELECT id FROM works WHERE title='Crime and Punishment' AND author='Fyodor Dostoevsky'), 'manual', true)
ON CONFLICT DO NOTHING;

INSERT INTO book_catalog (title, title_romanized, author, language, country_of_origin, script, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('Преступление и наказание', 'Prestupleniye i nakazaniye',
   'Фёдор Достоевский',
   'Russian', 'Russian Empire', 'Cyrillic', 'Eksmo', 2005, 1866, 'Fiction',
   (SELECT id FROM works WHERE title='Crime and Punishment' AND author='Fyodor Dostoevsky'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- War and Peace
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('War and Peace', 'Leo Tolstoy', '9780140447934', 'English', 'Russian', 'Penguin Classics', 1982, 1869, 'Fiction,History', 'https://covers.openlibrary.org/b/id/8228691-L.jpg', (SELECT id FROM works WHERE title='War and Peace' AND author='Leo Tolstoy'), 'manual', true)
ON CONFLICT DO NOTHING;

INSERT INTO book_catalog (title, title_romanized, author, language, country_of_origin, script, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('Война и мир', 'Voyna i mir',
   'Лев Толстой',
   'Russian', 'Russian Empire', 'Cyrillic', 'Азбука', 2012, 1869, 'Fiction,History',
   (SELECT id FROM works WHERE title='War and Peace' AND author='Leo Tolstoy'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- The Bridge on the Drina
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Bridge on the Drina', 'Ivo Andrić', '0226020452', '9780226020457', 'English', 'Serbian', 'University of Chicago Press', 1977, 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', (SELECT id FROM works WHERE title='The Bridge on the Drina' AND author='Ivo Andrić'), 'manual', true),
  ('Na Drini ćuprija',        'Ivo Andrić', NULL,         '9788652118038', 'Serbian', NULL,     'Prosveta',                   1945, 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9788652118038-L.jpg', (SELECT id FROM works WHERE title='The Bridge on the Drina' AND author='Ivo Andrić'), 'manual', true)
ON CONFLICT DO NOTHING;

-- The Bridge on the Drina — German translation
INSERT INTO book_catalog (title, author, language, original_language, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('Die Brücke über die Drina', 'Ivo Andrić', 'German', 'Serbian', 'Paul Zsolnay Verlag', 1953, 1945, 'Fiction,History',
   (SELECT id FROM works WHERE title='The Bridge on the Drina' AND author='Ivo Andrić'),
   'manual', true)
ON CONFLICT DO NOTHING;

-- Death and the Dervish
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Death and the Dervish', 'Meša Selimović', '9780810112384', 'English', 'Bosnian', 'Northwestern University Press', 1996, 1966, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/13127483-L.jpg', (SELECT id FROM works WHERE title='Death and the Dervish' AND author='Meša Selimović'), 'manual', true),
  ('Derviš i smrt',         'Meša Selimović', NULL,            'Bosnian', NULL,      'Svjetlost',                     1966, 1966, 'Fiction,Philosophy', NULL,                                                   (SELECT id FROM works WHERE title='Death and the Dervish' AND author='Meša Selimović'), 'manual', true)
ON CONFLICT DO NOTHING;

-- The Damned Yard
INSERT INTO book_catalog (title, author, language, original_language, publisher, publication_year, first_published_year, genre, work_id, source, verified) VALUES
  ('The Damned Yard',  'Ivo Andrić', 'English', 'Serbian', 'Forest Books', 1992, 1954, 'Fiction', (SELECT id FROM works WHERE title='The Damned Yard' AND author='Ivo Andrić'), 'manual', true),
  ('Prokleta avlija',  'Ivo Andrić', 'Serbian', NULL,      'Prosveta',     1954, 1954, 'Fiction', (SELECT id FROM works WHERE title='The Damned Yard' AND author='Ivo Andrić'), 'manual', true)
ON CONFLICT DO NOTHING;

-- A Brief History of Time
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('A Brief History of Time',                  'Stephen Hawking', '0553380168', '9780553380163', 'English', 'Bantam', 1988, 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', (SELECT id FROM works WHERE title='A Brief History of Time' AND author='Stephen Hawking'), 'manual', true),
  ('A Brief History of Time (Updated Edition)', 'Stephen Hawking', NULL,         '9780553804577', 'English', 'Bantam', 1998, 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553804577-L.jpg', (SELECT id FROM works WHERE title='A Brief History of Time' AND author='Stephen Hawking'), 'manual', true)
ON CONFLICT DO NOTHING;

-- 1984
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('1984',                 'George Orwell', '0451524934', '9780451524935', 'English', 'Signet Classics',         1950, 1949, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', (SELECT id FROM works WHERE title='1984' AND author='George Orwell'), 'manual', true),
  ('Nineteen Eighty-Four', 'George Orwell', NULL,         '9780141036144', 'English', 'Penguin Modern Classics', 2004, 1949, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780141036144-L.jpg', (SELECT id FROM works WHERE title='1984' AND author='George Orwell'), 'manual', true)
ON CONFLICT DO NOTHING;

-- The Left Hand of Darkness
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Left Hand of Darkness', 'Ursula K. Le Guin', '0441478123', '9780441478125', 'English', 'Ace', 1969, 1969, 'Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', (SELECT id FROM works WHERE title='The Left Hand of Darkness' AND author='Ursula K. Le Guin'), 'manual', true)
ON CONFLICT DO NOTHING;

-- The Diaries of Franz Kafka
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Diaries of Franz Kafka', 'Franz Kafka', '0805209069', '9780805209068', 'English', 'German', 'Schocken',          1988, 1948, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', (SELECT id FROM works WHERE title='The Diaries of Franz Kafka' AND author='Franz Kafka'), 'manual', true),
  ('Tagebücher',                'Franz Kafka', NULL,         NULL,            'German',  NULL,     'S. Fischer Verlag', 1954, 1948, 'Non-Fiction,Biography', NULL,                                                      (SELECT id FROM works WHERE title='The Diaries of Franz Kafka' AND author='Franz Kafka'), 'manual', true)
ON CONFLICT DO NOTHING;

-- One Hundred Years of Solitude
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('One Hundred Years of Solitude', 'Gabriel García Márquez', '0060883286', '9780060883287', 'English', 'Spanish', 'Harper Perennial Modern Classics', 2006, 1967, 'Fiction', 'https://covers.openlibrary.org/b/id/8411716-L.jpg', (SELECT id FROM works WHERE title='One Hundred Years of Solitude' AND author='Gabriel García Márquez'), 'manual', true),
  ('Cien años de soledad',          'Gabriel García Márquez', NULL,         '9788497592208', 'Spanish', NULL,      'Cátedra',                          2007, 1967, 'Fiction', NULL,                                                 (SELECT id FROM works WHERE title='One Hundred Years of Solitude' AND author='Gabriel García Márquez'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Don Quixote
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Don Quixote',                                   'Miguel de Cervantes', '9780060934347', 'English', 'Spanish', 'Harper Perennial Modern Classics', 2003, 1605, 'Fiction', 'https://covers.openlibrary.org/b/id/8416816-L.jpg', (SELECT id FROM works WHERE title='Don Quixote' AND author='Miguel de Cervantes'), 'manual', true),
  ('El ingenioso hidalgo don Quijote de la Mancha', 'Miguel de Cervantes', NULL,            'Spanish', NULL,      'Real Academia Española',           2004, 1605, 'Fiction', NULL,                                                 (SELECT id FROM works WHERE title='Don Quixote' AND author='Miguel de Cervantes'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Things Fall Apart
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, country_of_origin, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Things Fall Apart', 'Chinua Achebe', '0385474547', '9780385474542', 'English', 'Nigeria', 'Anchor', 1994, 1958, 'Fiction', 'https://covers.openlibrary.org/b/id/8468612-L.jpg', (SELECT id FROM works WHERE title='Things Fall Apart' AND author='Chinua Achebe'), 'manual', true)
ON CONFLICT DO NOTHING;

-- The Divine Comedy
INSERT INTO book_catalog (title, author, isbn_13, language, original_language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('The Divine Comedy',  'Dante Alighieri', '9780142437223', 'English', 'Italian', 'Penguin Classics', 2003, 1320, 'Poetry,Fiction', 'https://covers.openlibrary.org/b/id/8470260-L.jpg', (SELECT id FROM works WHERE title='The Divine Comedy' AND author='Dante Alighieri'), 'manual', true),
  ('La Divina Commedia', 'Dante Alighieri', NULL,            'Italian', NULL,      'Einaudi',          2014, 1320, 'Poetry,Fiction', NULL,                                                 (SELECT id FROM works WHERE title='The Divine Comedy' AND author='Dante Alighieri'), 'manual', true)
ON CONFLICT DO NOTHING;

-- Hamlet
INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, publisher, publication_year, first_published_year, genre, cover_url, work_id, source, verified) VALUES
  ('Hamlet', 'William Shakespeare', '0743477124', '9780743477123', 'English', 'Simon & Schuster', 2003, 1603, 'Fiction,Drama', 'https://covers.openlibrary.org/b/id/8471820-L.jpg', (SELECT id FROM works WHERE title='Hamlet' AND author='William Shakespeare'), 'manual', true)
ON CONFLICT DO NOTHING;
