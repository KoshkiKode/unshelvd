-- ============================================================
-- Unshelv'd -- Comprehensive Catalog Seed Data
-- PostgreSQL (Cloud SQL compatible)
--
-- Inserts works and book catalog entries.
-- Run AFTER applying migrations. Safe to re-run (ON CONFLICT DO NOTHING).
--
-- Usage (psql):
--   psql "$DATABASE_URL" -f database/seed-catalog.sql
-- ============================================================

-- Works
INSERT INTO works (title, author, original_language, first_published_year, genre, cover_url, source, verified)
VALUES
  ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', 'Hebrew', 2011, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', 'manual', true),
  ('Meditations', 'Marcus Aurelius', 'Ancient Greek', 180, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', 'manual', true),
  ('Blood Meridian', 'Cormac McCarthy', 'English', 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', 'manual', true),
  ('Dune', 'Frank Herbert', 'English', 1965, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', 'manual', true),
  ('Kafka on the Shore', 'Haruki Murakami', 'Japanese', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', 'manual', true),
  ('The Stranger', 'Albert Camus', 'French', 1942, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', 'manual', true),
  ('Norwegian Wood', 'Haruki Murakami', 'Japanese', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', 'manual', true),
  ('House of Leaves', 'Mark Z. Danielewski', 'English', 2000, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', 'manual', true),
  ('The Brothers Karamazov', 'Fyodor Dostoevsky', 'Russian', 1880, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', 'manual', true),
  ('The Master and Margarita', 'Mikhail Bulgakov', 'Russian', 1967, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', 'manual', true),
  ('Roadside Picnic', 'Arkady and Boris Strugatsky', 'Russian', 1972, 'Sci-Fi', 'https://covers.openlibrary.org/b/id/8443792-L.jpg', 'manual', true),
  ('Crime and Punishment', 'Fyodor Dostoevsky', 'Russian', 1866, 'Fiction', 'https://covers.openlibrary.org/b/id/8479260-L.jpg', 'manual', true),
  ('War and Peace', 'Leo Tolstoy', 'Russian', 1869, 'Fiction,History', 'https://covers.openlibrary.org/b/id/8228691-L.jpg', 'manual', true),
  ('The Bridge on the Drina', 'Ivo Andric', 'Serbian', 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', 'manual', true),
  ('Death and the Dervish', 'Mesa Selimovic', 'Bosnian', 1966, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/13127483-L.jpg', 'manual', true),
  ('The Damned Yard', 'Ivo Andric', 'Serbian', 1954, 'Fiction', 'https://covers.openlibrary.org/b/id/8394082-L.jpg', 'manual', true),
  ('A Brief History of Time', 'Stephen Hawking', 'English', 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', 'manual', true),
  ('1984', 'George Orwell', 'English', 1949, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', 'manual', true),
  ('The Left Hand of Darkness', 'Ursula K. Le Guin', 'English', 1969, 'Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', 'manual', true),
  ('The Diaries of Franz Kafka', 'Franz Kafka', 'German', 1948, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'manual', true),
  ('One Hundred Years of Solitude', 'Gabriel Garcia Marquez', 'Spanish', 1967, 'Fiction', 'https://covers.openlibrary.org/b/id/8411716-L.jpg', 'manual', true),
  ('Don Quixote', 'Miguel de Cervantes', 'Spanish', 1605, 'Fiction', 'https://covers.openlibrary.org/b/id/8416816-L.jpg', 'manual', true),
  ('Things Fall Apart', 'Chinua Achebe', 'English', 1958, 'Fiction', 'https://covers.openlibrary.org/b/id/8468612-L.jpg', 'manual', true),
  ('The Divine Comedy', 'Dante Alighieri', 'Italian', 1320, 'Poetry,Fiction', 'https://covers.openlibrary.org/b/id/8470260-L.jpg', 'manual', true),
  ('Hamlet', 'William Shakespeare', 'English', 1603, 'Fiction,Drama', 'https://covers.openlibrary.org/b/id/8471820-L.jpg', 'manual', true),
  ('Anna Karenina', 'Leo Tolstoy', 'Russian', 1877, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143035008-L.jpg', 'manual', true),
  ('The Idiot', 'Fyodor Dostoevsky', 'Russian', 1869, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140447927-L.jpg', 'manual', true),
  ('Notes from Underground', 'Fyodor Dostoevsky', 'Russian', 1864, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg', 'manual', true),
  ('Dead Souls', 'Nikolai Gogol', 'Russian', 1842, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140448078-L.jpg', 'manual', true),
  ('We', 'Yevgeny Zamyatin', 'Russian', 1924, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780140185852-L.jpg', 'manual', true),
  ('Doctor Zhivago', 'Boris Pasternak', 'Russian', 1957, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375408694-L.jpg', 'manual', true),
  ('The Trial', 'Franz Kafka', 'German', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'manual', true),
  ('The Metamorphosis', 'Franz Kafka', 'German', 1915, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780553213690-L.jpg', 'manual', true),
  ('Siddhartha', 'Hermann Hesse', 'German', 1922, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780553208849-L.jpg', 'manual', true),
  ('Steppenwolf', 'Hermann Hesse', 'German', 1927, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312278908-L.jpg', 'manual', true),
  ('The Magic Mountain', 'Thomas Mann', 'German', 1924, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679772873-L.jpg', 'manual', true),
  ('Death in Venice', 'Thomas Mann', 'German', 1912, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679722068-L.jpg', 'manual', true),
  ('The Tin Drum', 'Gunter Grass', 'German', 1959, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156900430-L.jpg', 'manual', true),
  ('Faust', 'Johann Wolfgang von Goethe', 'German', 1808, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780140440201-L.jpg', 'manual', true),
  ('Madame Bovary', 'Gustave Flaubert', 'French', 1857, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143136019-L.jpg', 'manual', true),
  ('Les Miserables', 'Victor Hugo', 'French', 1862, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140444308-L.jpg', 'manual', true),
  ('The Count of Monte Cristo', 'Alexandre Dumas', 'French', 1844, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg', 'manual', true),
  ('Swann''s Way', 'Marcel Proust', 'French', 1913, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437964-L.jpg', 'manual', true),
  ('Nausea', 'Jean-Paul Sartre', 'French', 1938, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780811201224-L.jpg', 'manual', true),
  ('The Plague', 'Albert Camus', 'French', 1947, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679720218-L.jpg', 'manual', true),
  ('Waiting for Godot', 'Samuel Beckett', 'French', 1953, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780802130341-L.jpg', 'manual', true),
  ('Journey to the End of the Night', 'Louis-Ferdinand Celine', 'French', 1932, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811201889-L.jpg', 'manual', true),
  ('The Little Prince', 'Antoine de Saint-Exupery', 'French', 1943, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg', 'manual', true),
  ('Love in the Time of Cholera', 'Gabriel Garcia Marquez', 'Spanish', 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140157741-L.jpg', 'manual', true),
  ('Ficciones', 'Jorge Luis Borges', 'Spanish', 1944, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802130303-L.jpg', 'manual', true),
  ('Pedro Paramo', 'Juan Rulfo', 'Spanish', 1955, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802144904-L.jpg', 'manual', true),
  ('The House of the Spirits', 'Isabel Allende', 'Spanish', 1982, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781501117015-L.jpg', 'manual', true),
  ('Blindness', 'Jose Saramago', 'Portuguese', 1995, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156007757-L.jpg', 'manual', true),
  ('The Book of Disquiet', 'Fernando Pessoa', 'Portuguese', 1982, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780141183046-L.jpg', 'manual', true),
  ('If on a winter''s night a traveler', 'Italo Calvino', 'Italian', 1979, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156439619-L.jpg', 'manual', true),
  ('The Name of the Rose', 'Umberto Eco', 'Italian', 1980, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156001311-L.jpg', 'manual', true),
  ('The Leopard', 'Giuseppe Tomasi di Lampedusa', 'Italian', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375714566-L.jpg', 'manual', true),
  ('Snow Country', 'Yasunari Kawabata', 'Japanese', 1956, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679761051-L.jpg', 'manual', true),
  ('No Longer Human', 'Osamu Dazai', 'Japanese', 1948, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg', 'manual', true),
  ('The Sound of Waves', 'Yukio Mishima', 'Japanese', 1954, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679752684-L.jpg', 'manual', true),
  ('1Q84', 'Haruki Murakami', 'Japanese', 2009, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307593313-L.jpg', 'manual', true),
  ('The Wind-Up Bird Chronicle', 'Haruki Murakami', 'Japanese', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679775430-L.jpg', 'manual', true),
  ('Silence', 'Shusaku Endo', 'Japanese', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312422608-L.jpg', 'manual', true),
  ('Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa', 'Japanese', 1915, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449709-L.jpg', 'manual', true),
  ('Dream of the Red Chamber', 'Cao Xueqin', 'Classical Chinese', 1791, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140443714-L.jpg', 'manual', true),
  ('Journey to the West', 'Wu Cheng-en', 'Classical Chinese', 1592, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780226920535-L.jpg', 'manual', true),
  ('The Iliad', 'Homer', 'Ancient Greek', -800, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140447940-L.jpg', 'manual', true),
  ('The Odyssey', 'Homer', 'Ancient Greek', -800, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140268867-L.jpg', 'manual', true),
  ('The Aeneid', 'Virgil', 'Latin', -19, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140449327-L.jpg', 'manual', true),
  ('The Republic', 'Plato', 'Ancient Greek', -380, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140455113-L.jpg', 'manual', true),
  ('The Art of War', 'Sun Tzu', 'Classical Chinese', -500, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780199540174-L.jpg', 'manual', true),
  ('Tao Te Ching', 'Lao Tzu', 'Classical Chinese', -400, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140441314-L.jpg', 'manual', true),
  ('The Analects', 'Confucius', 'Classical Chinese', -479, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140443486-L.jpg', 'manual', true),
  ('Bhagavad Gita', 'Vyasa', 'Sanskrit', -200, 'Philosophy,Religion', 'https://covers.openlibrary.org/b/isbn/9780140449181-L.jpg', 'manual', true),
  ('Beowulf', 'Anonymous', 'Old English', 700, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393320978-L.jpg', 'manual', true),
  ('The Canterbury Tales', 'Geoffrey Chaucer', 'Middle English', 1387, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140422344-L.jpg', 'manual', true),
  ('The Decameron', 'Giovanni Boccaccio', 'Italian', 1353, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449303-L.jpg', 'manual', true),
  ('Paradise Lost', 'John Milton', 'English', 1667, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780140424393-L.jpg', 'manual', true),
  ('Candide', 'Voltaire', 'French', 1759, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140440041-L.jpg', 'manual', true),
  ('Robinson Crusoe', 'Daniel Defoe', 'English', 1719, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439822-L.jpg', 'manual', true),
  ('Pride and Prejudice', 'Jane Austen', 'English', 1813, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg', 'manual', true),
  ('Jane Eyre', 'Charlotte Bronte', 'English', 1847, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg', 'manual', true),
  ('Wuthering Heights', 'Emily Bronte', 'English', 1847, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439556-L.jpg', 'manual', true),
  ('Great Expectations', 'Charles Dickens', 'English', 1861, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439563-L.jpg', 'manual', true),
  ('Moby-Dick', 'Herman Melville', 'English', 1851, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg', 'manual', true),
  ('The Scarlet Letter', 'Nathaniel Hawthorne', 'English', 1850, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437261-L.jpg', 'manual', true),
  ('Adventures of Huckleberry Finn', 'Mark Twain', 'English', 1884, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437179-L.jpg', 'manual', true),
  ('Dracula', 'Bram Stoker', 'English', 1897, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780141439846-L.jpg', 'manual', true),
  ('The Picture of Dorian Gray', 'Oscar Wilde', 'English', 1890, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141442464-L.jpg', 'manual', true),
  ('Ulysses', 'James Joyce', 'English', 1922, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780394743127-L.jpg', 'manual', true),
  ('Mrs Dalloway', 'Virginia Woolf', 'English', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156628709-L.jpg', 'manual', true),
  ('Animal Farm', 'George Orwell', 'English', 1945, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg', 'manual', true),
  ('Brave New World', 'Aldous Huxley', 'English', 1932, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg', 'manual', true),
  ('Lord of the Flies', 'William Golding', 'English', 1954, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780399501487-L.jpg', 'manual', true),
  ('A Clockwork Orange', 'Anthony Burgess', 'English', 1962, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393312836-L.jpg', 'manual', true),
  ('The Great Gatsby', 'F. Scott Fitzgerald', 'English', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg', 'manual', true),
  ('The Sound and the Fury', 'William Faulkner', 'English', 1929, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679732242-L.jpg', 'manual', true),
  ('To Kill a Mockingbird', 'Harper Lee', 'English', 1960, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg', 'manual', true),
  ('The Grapes of Wrath', 'John Steinbeck', 'English', 1939, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143039433-L.jpg', 'manual', true),
  ('East of Eden', 'John Steinbeck', 'English', 1952, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142004234-L.jpg', 'manual', true),
  ('Catch-22', 'Joseph Heller', 'English', 1961, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781451626650-L.jpg', 'manual', true),
  ('Slaughterhouse-Five', 'Kurt Vonnegut', 'English', 1969, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780440180296-L.jpg', 'manual', true),
  ('The Catcher in the Rye', 'J.D. Salinger', 'English', 1951, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg', 'manual', true),
  ('On the Road', 'Jack Kerouac', 'English', 1957, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140283297-L.jpg', 'manual', true),
  ('Beloved', 'Toni Morrison', 'English', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400033416-L.jpg', 'manual', true),
  ('The Road', 'Cormac McCarthy', 'English', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg', 'manual', true),
  ('The Hobbit', 'J.R.R. Tolkien', 'English', 1937, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg', 'manual', true),
  ('The Fellowship of the Ring', 'J.R.R. Tolkien', 'English', 1954, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780618574940-L.jpg', 'manual', true),
  ('Foundation', 'Isaac Asimov', 'English', 1951, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg', 'manual', true),
  ('Fahrenheit 451', 'Ray Bradbury', 'English', 1953, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg', 'manual', true),
  ('Neuromancer', 'William Gibson', 'English', 1984, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg', 'manual', true),
  ('Do Androids Dream of Electric Sheep?', 'Philip K. Dick', 'English', 1968, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345404473-L.jpg', 'manual', true),
  ('The Hitchhiker''s Guide to the Galaxy', 'Douglas Adams', 'English', 1979, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg', 'manual', true),
  ('On the Origin of Species', 'Charles Darwin', 'English', 1859, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780140432053-L.jpg', 'manual', true),
  ('Man''s Search for Meaning', 'Viktor Frankl', 'German', 1946, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg', 'manual', true),
  ('The Diary of a Young Girl', 'Anne Frank', 'Dutch', 1947, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780553296983-L.jpg', 'manual', true),
  ('Night', 'Elie Wiesel', 'French', 1958, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780374500016-L.jpg', 'manual', true),
  ('In Cold Blood', 'Truman Capote', 'English', 1966, 'Non-Fiction', 'https://covers.openlibrary.org/b/isbn/9780679745587-L.jpg', 'manual', true),
  ('The Remains of the Day', 'Kazuo Ishiguro', 'English', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679731726-L.jpg', 'manual', true),
  ('Never Let Me Go', 'Kazuo Ishiguro', 'English', 2005, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400078776-L.jpg', 'manual', true),
  ('The Kite Runner', 'Khaled Hosseini', 'English', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781594631931-L.jpg', 'manual', true),
  ('Life of Pi', 'Yann Martel', 'English', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156027328-L.jpg', 'manual', true),
  ('Midnight''s Children', 'Salman Rushdie', 'English', 1981, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg', 'manual', true),
  ('The God of Small Things', 'Arundhati Roy', 'English', 1997, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679457312-L.jpg', 'manual', true),
  ('Gitanjali', 'Rabindranath Tagore', 'Bengali', 1910, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780333902981-L.jpg', 'manual', true),
  ('Season of Migration to the North', 'Tayeb Salih', 'Arabic', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780894108501-L.jpg', 'manual', true)
ON CONFLICT DO NOTHING;

-- Book Catalog Editions
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'English', 'Harper', 2015, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780099590088', 'English', 'Vintage', 2015, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780099590088-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Meditations', 'Marcus Aurelius', '9780140449334', 'English', 'Penguin Classics', 2006, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Meditations', 'Marcus Aurelius', '9780486298238', 'English', 'Dover', 1997, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780486298238-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Blood Meridian, or the Evening Redness in the West', 'Cormac McCarthy', '9780679728757', 'English', 'Vintage', 1992, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Dune', 'Frank Herbert', '9780441172719', 'English', 'Ace', 1990, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Dune', 'Frank Herbert', '9780593099322', 'English', 'Ace', 2019, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/id/13186889-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Kafka on the Shore', 'Haruki Murakami', '9781400079278', 'English', 'Vintage', 2005, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Umibe no Kafuka', 'Murakami Haruki', '9784101001616', 'Japanese', 'Shinchosha', 2005, 'Fiction', 'https://covers.openlibrary.org/b/id/8471060-L.jpg', NULL, 'Japan', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Stranger', 'Albert Camus', '9780679720201', 'English', 'Vintage', 1989, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('L''Etranger', 'Albert Camus', '9782070360024', 'French', 'Gallimard', 1971, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/8408558-L.jpg', NULL, 'France', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Norwegian Wood', 'Haruki Murakami', '9780375704024', 'English', 'Vintage', 2000, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Noruwei no Mori', 'Murakami Haruki', '9784062749497', 'Japanese', 'Kodansha', 2004, 'Fiction', NULL, NULL, 'Japan', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('House of Leaves', 'Mark Z. Danielewski', '9780375703768', 'English', 'Pantheon', 2000, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Brothers Karamazov', 'Fyodor Dostoevsky', '9780374528379', 'English', 'Farrar Straus Giroux', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Bratya Karamazovy', 'Fyodor Dostoyevsky', NULL, 'Russian', 'Eksmo', 2008, 'Fiction', 'https://covers.openlibrary.org/b/id/8409928-L.jpg', NULL, 'Russian Empire', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Master and Margarita', 'Mikhail Bulgakov', '9780141180144', 'English', 'Penguin Classics', 1997, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Master i Margarita', 'Mikhail Bulgakov', '9785170977871', 'Russian', 'AST', 2019, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9785170977871-L.jpg', NULL, 'USSR / Soviet Union', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Roadside Picnic', 'Arkady and Boris Strugatsky', '9781613743416', 'English', 'Chicago Review Press', 2012, 'Sci-Fi', 'https://covers.openlibrary.org/b/id/8443792-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Piknik na obochine', 'Arkady i Boris Strugatsky', NULL, 'Russian', 'Molodaya gvardiya', 1972, 'Sci-Fi', NULL, NULL, 'USSR / Soviet Union', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Crime and Punishment', 'Fyodor Dostoevsky', '9780143058144', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/id/8479260-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Prestupleniye i nakazaniye', 'Fyodor Dostoyevsky', NULL, 'Russian', 'Eksmo', 2005, 'Fiction', NULL, NULL, 'Russian Empire', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('War and Peace', 'Leo Tolstoy', '9780140447934', 'English', 'Penguin Classics', 1982, 'Fiction,History', 'https://covers.openlibrary.org/b/id/8228691-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Voyna i mir', 'Lev Tolstoy', NULL, 'Russian', 'Azbuka', 2012, 'Fiction,History', NULL, NULL, 'Russian Empire', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Bridge on the Drina', 'Ivo Andric', '9780226020457', 'English', 'University of Chicago Press', 1977, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', 'Serbian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Na Drini cuprija', 'Ivo Andric', '9788652118038', 'Serbian', 'Prosveta', 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9788652118038-L.jpg', NULL, 'Yugoslavia', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Death and the Dervish', 'Mesa Selimovic', '9780810112384', 'English', 'Northwestern University Press', 1996, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/13127483-L.jpg', 'Bosnian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Dervis i smrt', 'Mesa Selimovic', NULL, 'Bosnian', 'Svjetlost', 1966, 'Fiction,Philosophy', NULL, NULL, 'Yugoslavia', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Damned Yard', 'Ivo Andric', NULL, 'English', 'Forest Books', 1992, 'Fiction', NULL, 'Serbian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Prokleta avlija', 'Ivo Andric', NULL, 'Serbian', 'Prosveta', 1954, 'Fiction', NULL, NULL, 'Yugoslavia', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('A Brief History of Time', 'Stephen Hawking', '9780553380163', 'English', 'Bantam', 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('A Brief History of Time (Updated Edition)', 'Stephen Hawking', '9780553804577', 'English', 'Bantam', 1998, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553804577-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('1984', 'George Orwell', '9780451524935', 'English', 'Signet Classics', 1950, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Nineteen Eighty-Four', 'George Orwell', '9780141036144', 'English', 'Penguin Modern Classics', 2004, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780141036144-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Left Hand of Darkness', 'Ursula K. Le Guin', '9780441478125', 'English', 'Ace', 1969, 'Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Diaries of Franz Kafka', 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1988, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Tagebucher', 'Franz Kafka', NULL, 'German', 'S. Fischer Verlag', 1954, 'Non-Fiction,Biography', NULL, NULL, 'Austria-Hungary', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('One Hundred Years of Solitude', 'Gabriel Garcia Marquez', '9780060883287', 'English', 'Harper Perennial', 2006, 'Fiction', 'https://covers.openlibrary.org/b/id/8411716-L.jpg', 'Spanish', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Cien anos de soledad', 'Gabriel Garcia Marquez', '9788497592208', 'Spanish', 'Catedra', 2007, 'Fiction', NULL, NULL, 'Colombia', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Don Quixote', 'Miguel de Cervantes', '9780060934347', 'English', 'Harper Perennial', 2003, 'Fiction', 'https://covers.openlibrary.org/b/id/8416816-L.jpg', 'Spanish', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('El ingenioso hidalgo don Quijote', 'Miguel de Cervantes', NULL, 'Spanish', 'Real Academia Espanola', 2004, 'Fiction', NULL, NULL, 'Spain', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Things Fall Apart', 'Chinua Achebe', '9780385474542', 'English', 'Anchor', 1994, 'Fiction', 'https://covers.openlibrary.org/b/id/8468612-L.jpg', NULL, 'Nigeria', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Divine Comedy', 'Dante Alighieri', '9780142437223', 'English', 'Penguin Classics', 2003, 'Poetry,Fiction', 'https://covers.openlibrary.org/b/id/8470260-L.jpg', 'Italian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('La Divina Commedia', 'Dante Alighieri', NULL, 'Italian', 'Einaudi', 2014, 'Poetry,Fiction', NULL, NULL, 'Italy', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Hamlet', 'William Shakespeare', '9780743477123', 'English', 'Simon and Schuster', 2003, 'Fiction,Drama', 'https://covers.openlibrary.org/b/id/8471820-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Anna Karenina', 'Leo Tolstoy', '9780143035008', 'English', 'Penguin Classics', 2000, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143035008-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Anna Karenina', 'Lev Tolstoy', NULL, 'Russian', 'Azbuka', 2013, 'Fiction', NULL, NULL, 'Russian Empire', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Idiot', 'Fyodor Dostoevsky', '9780140447927', 'English', 'Penguin Classics', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140447927-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Notes from Underground', 'Fyodor Dostoevsky', '9780140449136', 'English', 'Penguin Classics', 2009, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Dead Souls', 'Nikolai Gogol', '9780140448078', 'English', 'Penguin Classics', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140448078-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('We', 'Yevgeny Zamyatin', '9780140185852', 'English', 'Penguin Classics', 1993, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780140185852-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('My', 'Evgeniy Zamyatin', NULL, 'Russian', 'Azbuka', 2008, 'Fiction,Sci-Fi', NULL, NULL, 'USSR / Soviet Union', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Doctor Zhivago', 'Boris Pasternak', '9780375408694', 'English', 'Pantheon', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375408694-L.jpg', 'Russian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Trial', 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1999, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Metamorphosis', 'Franz Kafka', '9780553213690', 'English', 'Bantam', 1972, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780553213690-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Siddhartha', 'Hermann Hesse', '9780553208849', 'English', 'Bantam', 1951, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780553208849-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Steppenwolf', 'Hermann Hesse', '9780312278908', 'English', 'Picador', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312278908-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Magic Mountain', 'Thomas Mann', '9780679772873', 'English', 'Vintage', 1996, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679772873-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Death in Venice', 'Thomas Mann', '9780679722068', 'English', 'Vintage', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679722068-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Tin Drum', 'Gunter Grass', '9780156900430', 'English', 'Harvest', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156900430-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Faust', 'Johann Wolfgang von Goethe', '9780140440201', 'English', 'Penguin Classics', 2005, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780140440201-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Madame Bovary', 'Gustave Flaubert', '9780143136019', 'English', 'Penguin Classics', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143136019-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Madame Bovary', 'Gustave Flaubert', '9782070413119', 'French', 'Gallimard', 1972, 'Fiction', NULL, NULL, 'France', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Les Miserables', 'Victor Hugo', '9780140444308', 'English', 'Penguin Classics', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140444308-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Les Miserables', 'Victor Hugo', '9782070409228', 'French', 'Gallimard', 2000, 'Fiction', NULL, NULL, 'France', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Count of Monte Cristo', 'Alexandre Dumas', '9780140449266', 'English', 'Penguin Classics', 1996, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Swann''s Way', 'Marcel Proust', '9780142437964', 'English', 'Penguin Classics', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437964-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Nausea', 'Jean-Paul Sartre', '9780811201224', 'English', 'New Directions', 1964, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780811201224-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Plague', 'Albert Camus', '9780679720218', 'English', 'Vintage', 1991, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679720218-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Waiting for Godot', 'Samuel Beckett', '9780802130341', 'English', 'Grove Press', 1954, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780802130341-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Journey to the End of the Night', 'Louis-Ferdinand Celine', '9780811201889', 'English', 'New Directions', 1983, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811201889-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Little Prince', 'Antoine de Saint-Exupery', '9780156012195', 'English', 'Harvest', 2000, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Le Petit Prince', 'Antoine de Saint-Exupery', '9782070408504', 'French', 'Gallimard', 1993, 'Fiction', NULL, NULL, 'France', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Love in the Time of Cholera', 'Gabriel Garcia Marquez', '9780140157741', 'English', 'Penguin', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140157741-L.jpg', 'Spanish', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Ficciones', 'Jorge Luis Borges', '9780802130303', 'English', 'Grove Press', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802130303-L.jpg', 'Spanish', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Pedro Paramo', 'Juan Rulfo', '9780802144904', 'English', 'Grove Press', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802144904-L.jpg', 'Spanish', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The House of the Spirits', 'Isabel Allende', '9781501117015', 'English', 'Atria', 2015, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781501117015-L.jpg', 'Spanish', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Blindness', 'Jose Saramago', '9780156007757', 'English', 'Harvest', 1999, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156007757-L.jpg', 'Portuguese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Book of Disquiet', 'Fernando Pessoa', '9780141183046', 'English', 'Penguin Classics', 2002, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780141183046-L.jpg', 'Portuguese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('If on a winter''s night a traveler', 'Italo Calvino', '9780156439619', 'English', 'Harvest', 1982, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156439619-L.jpg', 'Italian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Name of the Rose', 'Umberto Eco', '9780156001311', 'English', 'Harvest', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156001311-L.jpg', 'Italian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Leopard', 'Giuseppe Tomasi di Lampedusa', '9780375714566', 'English', 'Pantheon', 2007, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375714566-L.jpg', 'Italian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Snow Country', 'Yasunari Kawabata', '9780679761051', 'English', 'Vintage', 1996, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679761051-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Yukiguni', 'Kawabata Yasunari', NULL, 'Japanese', 'Shinchosha', 1948, 'Fiction', NULL, NULL, 'Japan', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('No Longer Human', 'Osamu Dazai', '9780811204811', 'English', 'New Directions', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Sound of Waves', 'Yukio Mishima', '9780679752684', 'English', 'Vintage', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679752684-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('1Q84', 'Haruki Murakami', '9780307593313', 'English', 'Knopf', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307593313-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Wind-Up Bird Chronicle', 'Haruki Murakami', '9780679775430', 'English', 'Vintage', 1998, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679775430-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Silence', 'Shusaku Endo', '9780312422608', 'English', 'Picador', 2016, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312422608-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa', '9780140449709', 'English', 'Penguin Classics', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449709-L.jpg', 'Japanese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Dream of the Red Chamber', 'Cao Xueqin', '9780140443714', 'English', 'Penguin Classics', 1973, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140443714-L.jpg', 'Classical Chinese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Monkey: A Folk Novel of China', 'Wu Cheng-en', '9780802150219', 'English', 'Grove Press', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802150219-L.jpg', 'Classical Chinese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Iliad (trans. Robert Fagles)', 'Homer', '9780140447940', 'English', 'Penguin Classics', 1998, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140447940-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Iliad (trans. Emily Wilson)', 'Homer', '9780393246414', 'English', 'Norton', 2023, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393246414-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Odyssey (trans. Emily Wilson)', 'Homer', '9780393246025', 'English', 'Norton', 2018, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393246025-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Odyssey (trans. Robert Fitzgerald)', 'Homer', '9780374525743', 'English', 'Farrar Straus Giroux', 1998, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780374525743-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Aeneid (trans. Robert Fagles)', 'Virgil', '9780670038176', 'English', 'Viking', 2006, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780670038176-L.jpg', 'Latin', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Republic', 'Plato', '9780140455113', 'English', 'Penguin Classics', 2007, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140455113-L.jpg', 'Ancient Greek', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Art of War', 'Sun Tzu', '9780199540174', 'English', 'Oxford', 2008, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780199540174-L.jpg', 'Classical Chinese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Tao Te Ching', 'Lao Tzu', '9780140441314', 'English', 'Penguin Classics', 1963, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140441314-L.jpg', 'Classical Chinese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Analects', 'Confucius', '9780140443486', 'English', 'Penguin Classics', 1979, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140443486-L.jpg', 'Classical Chinese', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Bhagavad Gita', 'Vyasa', '9780140449181', 'English', 'Penguin Classics', 2003, 'Philosophy,Religion', 'https://covers.openlibrary.org/b/isbn/9780140449181-L.jpg', 'Sanskrit', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Beowulf (trans. Seamus Heaney)', 'Anonymous', '9780393320978', 'English', 'Norton', 2001, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393320978-L.jpg', 'Old English', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Canterbury Tales', 'Geoffrey Chaucer', '9780140422344', 'English', 'Penguin Classics', 1951, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140422344-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Decameron', 'Giovanni Boccaccio', '9780140449303', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449303-L.jpg', 'Italian', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Paradise Lost', 'John Milton', '9780140424393', 'English', 'Penguin Classics', 2000, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780140424393-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Candide', 'Voltaire', '9780140440041', 'English', 'Penguin Classics', 1947, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140440041-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Candide', 'Voltaire', '9782070360246', 'French', 'Gallimard', 1992, 'Fiction,Philosophy', NULL, NULL, 'France', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Robinson Crusoe', 'Daniel Defoe', '9780141439822', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439822-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Pride and Prejudice', 'Jane Austen', '9780141439518', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Jane Eyre', 'Charlotte Bronte', '9780141441146', 'English', 'Penguin Classics', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Wuthering Heights', 'Emily Bronte', '9780141439556', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439556-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Great Expectations', 'Charles Dickens', '9780141439563', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439563-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Moby-Dick', 'Herman Melville', '9780142437247', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Moby-Dick (Norton Critical Edition)', 'Herman Melville', '9780393972832', 'English', 'Norton', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393972832-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Scarlet Letter', 'Nathaniel Hawthorne', '9780142437261', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437261-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Adventures of Huckleberry Finn', 'Mark Twain', '9780142437179', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437179-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Dracula', 'Bram Stoker', '9780141439846', 'English', 'Penguin Classics', 2003, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780141439846-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Picture of Dorian Gray', 'Oscar Wilde', '9780141442464', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141442464-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Ulysses', 'James Joyce', '9780394743127', 'English', 'Vintage', 1990, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780394743127-L.jpg', NULL, 'Ireland', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Mrs Dalloway', 'Virginia Woolf', '9780156628709', 'English', 'Harvest', 1981, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156628709-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Animal Farm', 'George Orwell', '9780451526342', 'English', 'Signet Classics', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Brave New World', 'Aldous Huxley', '9780060850524', 'English', 'Harper Perennial', 2006, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Lord of the Flies', 'William Golding', '9780399501487', 'English', 'Perigee', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780399501487-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('A Clockwork Orange', 'Anthony Burgess', '9780393312836', 'English', 'Norton', 2012, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393312836-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Great Gatsby', 'F. Scott Fitzgerald', '9780743273565', 'English', 'Scribner', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Sound and the Fury', 'William Faulkner', '9780679732242', 'English', 'Vintage', 1990, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679732242-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('To Kill a Mockingbird', 'Harper Lee', '9780061935466', 'English', 'Harper Perennial', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg', NULL, 'United States', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Grapes of Wrath', 'John Steinbeck', '9780143039433', 'English', 'Penguin Classics', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143039433-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('East of Eden', 'John Steinbeck', '9780142004234', 'English', 'Penguin', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142004234-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Catch-22', 'Joseph Heller', '9781451626650', 'English', 'Simon and Schuster', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781451626650-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Slaughterhouse-Five', 'Kurt Vonnegut', '9780440180296', 'English', 'Dell', 1991, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780440180296-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Catcher in the Rye', 'J.D. Salinger', '9780316769174', 'English', 'Little Brown', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('On the Road', 'Jack Kerouac', '9780140283297', 'English', 'Penguin', 1999, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140283297-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Beloved', 'Toni Morrison', '9781400033416', 'English', 'Vintage', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400033416-L.jpg', NULL, 'United States', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Road', 'Cormac McCarthy', '9780307387899', 'English', 'Vintage', 2007, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Hobbit', 'J.R.R. Tolkien', '9780547928227', 'English', 'Houghton Mifflin Harcourt', 2012, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Fellowship of the Ring', 'J.R.R. Tolkien', '9780618574940', 'English', 'Houghton Mifflin Harcourt', 2004, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780618574940-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Foundation', 'Isaac Asimov', '9780553293357', 'English', 'Spectra', 1991, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Fahrenheit 451', 'Ray Bradbury', '9781451673319', 'English', 'Simon and Schuster', 2012, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Neuromancer', 'William Gibson', '9780441569595', 'English', 'Ace', 1986, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Do Androids Dream of Electric Sheep?', 'Philip K. Dick', '9780345404473', 'English', 'Del Rey', 1996, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345404473-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Hitchhiker''s Guide to the Galaxy', 'Douglas Adams', '9780345391803', 'English', 'Del Rey', 1995, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('On the Origin of Species', 'Charles Darwin', '9780140432053', 'English', 'Penguin Classics', 1985, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780140432053-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Man''s Search for Meaning', 'Viktor Frankl', '9780807014271', 'English', 'Beacon Press', 2006, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg', 'German', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Diary of a Young Girl', 'Anne Frank', '9780553296983', 'English', 'Bantam', 1993, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780553296983-L.jpg', 'Dutch', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Night', 'Elie Wiesel', '9780374500016', 'English', 'Hill and Wang', 2006, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780374500016-L.jpg', 'French', NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('In Cold Blood', 'Truman Capote', '9780679745587', 'English', 'Vintage', 1994, 'Non-Fiction', 'https://covers.openlibrary.org/b/isbn/9780679745587-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Remains of the Day', 'Kazuo Ishiguro', '9780679731726', 'English', 'Vintage', 1990, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679731726-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Never Let Me Go', 'Kazuo Ishiguro', '9781400078776', 'English', 'Vintage', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400078776-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The Kite Runner', 'Khaled Hosseini', '9781594631931', 'English', 'Riverhead', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781594631931-L.jpg', NULL, 'Afghanistan', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Life of Pi', 'Yann Martel', '9780156027328', 'English', 'Harvest', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156027328-L.jpg', NULL, NULL, 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Midnight''s Children', 'Salman Rushdie', '9780812976533', 'English', 'Random House', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg', NULL, 'India', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('The God of Small Things', 'Arundhati Roy', '9780679457312', 'English', 'Random House', 1997, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679457312-L.jpg', NULL, 'India', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Gitanjali', 'Rabindranath Tagore', '9780333902981', 'English', 'Macmillan', 1913, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780333902981-L.jpg', 'Bengali', 'British India', 'manual', true)
  ON CONFLICT DO NOTHING;
INSERT INTO book_catalog (title, author, isbn_13, language, publisher, publication_year, genre, cover_url, original_language, country_of_origin, source, verified)
  VALUES ('Season of Migration to the North', 'Tayeb Salih', '9780894108501', 'English', 'NYRB Classics', 2009, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780894108501-L.jpg', 'Arabic', 'Sudan', 'manual', true)
  ON CONFLICT DO NOTHING;