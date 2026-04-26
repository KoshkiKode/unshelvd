#!/usr/bin/env python3
"""
Regenerate database/catalog.csv and database/seed-catalog.sql from three
public, non-rate-limited sources:

  1. The hand-curated CURATED_WORKS list embedded below (international
     classics, ~126 works).
  2. The goodbooks-10k dataset
     (https://github.com/zygmuntz/goodbooks-10k, CC BY-SA 4.0) — ~10,000
     popular works, one canonical edition each.
  3. The Book-Crossing dataset (Cai-Nicolas Ziegler, 2004) hosted on
     GitHub LFS — ~271,000 real edition records (ISBN, title, author,
     year, publisher) covering ~21,000 works with ≥2 editions.

Factual fields (titles, authors, ISBNs, publication years, publishers)
are not themselves copyrightable; the compilations are attributed in
database/README.md.

The generator is fully deterministic and idempotent: re-running it with
the same input data produces byte-identical output. It assigns
**Unshelv'd catalog IDs** to every work and every edition:

    work    -> UN<8-digit-zero-padded>W           e.g. UN00000042W
    edition -> UN<8-digit-zero-padded>W-E<3>      e.g. UN00000042W-E001

Edition IDs literally embed their parent work ID so the link is visible
without a join.

Usage:
    python3 scripts/build-seed-from-goodbooks.py
        [--cache-dir /tmp/seed]
        [--editions-per-work 6]

If the source CSVs are not present in --cache-dir, they will be
downloaded from raw.githubusercontent.com / media.githubusercontent.com.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
EXISTING_CSV = REPO_ROOT / "database" / "catalog.csv"
OUT_CSV = REPO_ROOT / "database" / "catalog.csv"
OUT_SQL = REPO_ROOT / "database" / "seed-catalog.sql"

GOODBOOKS_BASE = (
    "https://raw.githubusercontent.com/zygmuntz/goodbooks-10k/master"
)
# The Book-Crossing dataset is hosted on GitHub LFS (74MB). We pin a
# specific commit/owner so the data is reproducible. Multiple mirror
# repos host identical content (verified by SHA in the LFS pointer).
BX_URL = (
    "https://media.githubusercontent.com/media/irenehng/book-rec/"
    "9ed7e137b3f2b3ff0e4dee63d21292d38c7fa512/data/BX_Books.csv"
)
SOURCES = {
    "books.csv": f"{GOODBOOKS_BASE}/books.csv",
    "book_tags.csv": f"{GOODBOOKS_BASE}/book_tags.csv",
    "tags.csv": f"{GOODBOOKS_BASE}/tags.csv",
    "BX_Books.csv": BX_URL,
}

# Hand-curated work-level metadata. Sourced from the original
# database/seed-catalog.sql so we don't lose accurate first-published
# year and original-language values when regenerating.
# (title, author, original_language, first_published_year, genre, cover_url)
CURATED_WORKS = [
    ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', 'Hebrew', 2011, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg'),
    ('Meditations', 'Marcus Aurelius', 'Ancient Greek', 180, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg'),
    ('Blood Meridian', 'Cormac McCarthy', 'English', 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg'),
    ('Dune', 'Frank Herbert', 'English', 1965, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg'),
    ('Kafka on the Shore', 'Haruki Murakami', 'Japanese', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg'),
    ('The Stranger', 'Albert Camus', 'French', 1942, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg'),
    ('Norwegian Wood', 'Haruki Murakami', 'Japanese', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg'),
    ('House of Leaves', 'Mark Z. Danielewski', 'English', 2000, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg'),
    ('The Brothers Karamazov', 'Fyodor Dostoevsky', 'Russian', 1880, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg'),
    ('The Master and Margarita', 'Mikhail Bulgakov', 'Russian', 1967, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg'),
    ('Roadside Picnic', 'Arkady and Boris Strugatsky', 'Russian', 1972, 'Sci-Fi', 'https://covers.openlibrary.org/b/id/8443792-L.jpg'),
    ('Crime and Punishment', 'Fyodor Dostoevsky', 'Russian', 1866, 'Fiction', 'https://covers.openlibrary.org/b/id/8479260-L.jpg'),
    ('War and Peace', 'Leo Tolstoy', 'Russian', 1869, 'Fiction,History', 'https://covers.openlibrary.org/b/id/8228691-L.jpg'),
    ('The Bridge on the Drina', 'Ivo Andric', 'Serbian', 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg'),
    ('Death and the Dervish', 'Mesa Selimovic', 'Bosnian', 1966, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/13127483-L.jpg'),
    ('The Damned Yard', 'Ivo Andric', 'Serbian', 1954, 'Fiction', 'https://covers.openlibrary.org/b/id/8394082-L.jpg'),
    ('A Brief History of Time', 'Stephen Hawking', 'English', 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg'),
    ('1984', 'George Orwell', 'English', 1949, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg'),
    ('The Left Hand of Darkness', 'Ursula K. Le Guin', 'English', 1969, 'Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg'),
    ('The Diaries of Franz Kafka', 'Franz Kafka', 'German', 1948, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg'),
    ('One Hundred Years of Solitude', 'Gabriel Garcia Marquez', 'Spanish', 1967, 'Fiction', 'https://covers.openlibrary.org/b/id/8411716-L.jpg'),
    ('Don Quixote', 'Miguel de Cervantes', 'Spanish', 1605, 'Fiction', 'https://covers.openlibrary.org/b/id/8416816-L.jpg'),
    ('Things Fall Apart', 'Chinua Achebe', 'English', 1958, 'Fiction', 'https://covers.openlibrary.org/b/id/8468612-L.jpg'),
    ('The Divine Comedy', 'Dante Alighieri', 'Italian', 1320, 'Poetry,Fiction', 'https://covers.openlibrary.org/b/id/8470260-L.jpg'),
    ('Hamlet', 'William Shakespeare', 'English', 1603, 'Fiction,Drama', 'https://covers.openlibrary.org/b/id/8471820-L.jpg'),
    ('Anna Karenina', 'Leo Tolstoy', 'Russian', 1877, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143035008-L.jpg'),
    ('The Idiot', 'Fyodor Dostoevsky', 'Russian', 1869, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140447927-L.jpg'),
    ('Notes from Underground', 'Fyodor Dostoevsky', 'Russian', 1864, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg'),
    ('Dead Souls', 'Nikolai Gogol', 'Russian', 1842, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140448078-L.jpg'),
    ('We', 'Yevgeny Zamyatin', 'Russian', 1924, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780140185852-L.jpg'),
    ('Doctor Zhivago', 'Boris Pasternak', 'Russian', 1957, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375408694-L.jpg'),
    ('The Trial', 'Franz Kafka', 'German', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg'),
    ('The Metamorphosis', 'Franz Kafka', 'German', 1915, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780553213690-L.jpg'),
    ('Siddhartha', 'Hermann Hesse', 'German', 1922, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780553208849-L.jpg'),
    ('Steppenwolf', 'Hermann Hesse', 'German', 1927, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312278908-L.jpg'),
    ('The Magic Mountain', 'Thomas Mann', 'German', 1924, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679772873-L.jpg'),
    ('Death in Venice', 'Thomas Mann', 'German', 1912, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679722068-L.jpg'),
    ('The Tin Drum', 'Gunter Grass', 'German', 1959, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156900430-L.jpg'),
    ('Faust', 'Johann Wolfgang von Goethe', 'German', 1808, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780140440201-L.jpg'),
    ('Madame Bovary', 'Gustave Flaubert', 'French', 1857, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143136019-L.jpg'),
    ('Les Miserables', 'Victor Hugo', 'French', 1862, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140444308-L.jpg'),
    ('The Count of Monte Cristo', 'Alexandre Dumas', 'French', 1844, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg'),
    ('Swann''s Way', 'Marcel Proust', 'French', 1913, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437964-L.jpg'),
    ('Nausea', 'Jean-Paul Sartre', 'French', 1938, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780811201224-L.jpg'),
    ('The Plague', 'Albert Camus', 'French', 1947, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679720218-L.jpg'),
    ('Waiting for Godot', 'Samuel Beckett', 'French', 1953, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780802130341-L.jpg'),
    ('Journey to the End of the Night', 'Louis-Ferdinand Celine', 'French', 1932, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811201889-L.jpg'),
    ('The Little Prince', 'Antoine de Saint-Exupery', 'French', 1943, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg'),
    ('Love in the Time of Cholera', 'Gabriel Garcia Marquez', 'Spanish', 1985, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140157741-L.jpg'),
    ('Ficciones', 'Jorge Luis Borges', 'Spanish', 1944, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802130303-L.jpg'),
    ('Pedro Paramo', 'Juan Rulfo', 'Spanish', 1955, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802144904-L.jpg'),
    ('The House of the Spirits', 'Isabel Allende', 'Spanish', 1982, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781501117015-L.jpg'),
    ('Blindness', 'Jose Saramago', 'Portuguese', 1995, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156007757-L.jpg'),
    ('The Book of Disquiet', 'Fernando Pessoa', 'Portuguese', 1982, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780141183046-L.jpg'),
    ('If on a winter''s night a traveler', 'Italo Calvino', 'Italian', 1979, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156439619-L.jpg'),
    ('The Name of the Rose', 'Umberto Eco', 'Italian', 1980, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156001311-L.jpg'),
    ('The Leopard', 'Giuseppe Tomasi di Lampedusa', 'Italian', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375714566-L.jpg'),
    ('Snow Country', 'Yasunari Kawabata', 'Japanese', 1956, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679761051-L.jpg'),
    ('No Longer Human', 'Osamu Dazai', 'Japanese', 1948, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg'),
    ('The Sound of Waves', 'Yukio Mishima', 'Japanese', 1954, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679752684-L.jpg'),
    ('1Q84', 'Haruki Murakami', 'Japanese', 2009, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307593313-L.jpg'),
    ('The Wind-Up Bird Chronicle', 'Haruki Murakami', 'Japanese', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679775430-L.jpg'),
    ('Silence', 'Shusaku Endo', 'Japanese', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312422608-L.jpg'),
    ('Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa', 'Japanese', 1915, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449709-L.jpg'),
    ('Dream of the Red Chamber', 'Cao Xueqin', 'Classical Chinese', 1791, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140443714-L.jpg'),
    ('Journey to the West', 'Wu Cheng-en', 'Classical Chinese', 1592, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780226920535-L.jpg'),
    ('The Iliad', 'Homer', 'Ancient Greek', -800, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140447940-L.jpg'),
    ('The Odyssey', 'Homer', 'Ancient Greek', -800, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140268867-L.jpg'),
    ('The Aeneid', 'Virgil', 'Latin', -19, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140449327-L.jpg'),
    ('The Republic', 'Plato', 'Ancient Greek', -380, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140455113-L.jpg'),
    ('The Art of War', 'Sun Tzu', 'Classical Chinese', -500, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780199540174-L.jpg'),
    ('Tao Te Ching', 'Lao Tzu', 'Classical Chinese', -400, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140441314-L.jpg'),
    ('The Analects', 'Confucius', 'Classical Chinese', -479, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140443486-L.jpg'),
    ('Bhagavad Gita', 'Vyasa', 'Sanskrit', -200, 'Philosophy,Religion', 'https://covers.openlibrary.org/b/isbn/9780140449181-L.jpg'),
    ('Beowulf', 'Anonymous', 'Old English', 700, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393320978-L.jpg'),
    ('The Canterbury Tales', 'Geoffrey Chaucer', 'Middle English', 1387, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140422344-L.jpg'),
    ('The Decameron', 'Giovanni Boccaccio', 'Italian', 1353, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449303-L.jpg'),
    ('Paradise Lost', 'John Milton', 'English', 1667, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780140424393-L.jpg'),
    ('Candide', 'Voltaire', 'French', 1759, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140440041-L.jpg'),
    ('Robinson Crusoe', 'Daniel Defoe', 'English', 1719, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439822-L.jpg'),
    ('Pride and Prejudice', 'Jane Austen', 'English', 1813, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg'),
    ('Jane Eyre', 'Charlotte Bronte', 'English', 1847, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg'),
    ('Wuthering Heights', 'Emily Bronte', 'English', 1847, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439556-L.jpg'),
    ('Great Expectations', 'Charles Dickens', 'English', 1861, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439563-L.jpg'),
    ('Moby-Dick', 'Herman Melville', 'English', 1851, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg'),
    ('The Scarlet Letter', 'Nathaniel Hawthorne', 'English', 1850, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437261-L.jpg'),
    ('Adventures of Huckleberry Finn', 'Mark Twain', 'English', 1884, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437179-L.jpg'),
    ('Dracula', 'Bram Stoker', 'English', 1897, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780141439846-L.jpg'),
    ('The Picture of Dorian Gray', 'Oscar Wilde', 'English', 1890, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141442464-L.jpg'),
    ('Ulysses', 'James Joyce', 'English', 1922, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780394743127-L.jpg'),
    ('Mrs Dalloway', 'Virginia Woolf', 'English', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156628709-L.jpg'),
    ('Animal Farm', 'George Orwell', 'English', 1945, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg'),
    ('Brave New World', 'Aldous Huxley', 'English', 1932, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg'),
    ('Lord of the Flies', 'William Golding', 'English', 1954, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780399501487-L.jpg'),
    ('A Clockwork Orange', 'Anthony Burgess', 'English', 1962, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393312836-L.jpg'),
    ('The Great Gatsby', 'F. Scott Fitzgerald', 'English', 1925, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg'),
    ('The Sound and the Fury', 'William Faulkner', 'English', 1929, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679732242-L.jpg'),
    ('To Kill a Mockingbird', 'Harper Lee', 'English', 1960, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg'),
    ('The Grapes of Wrath', 'John Steinbeck', 'English', 1939, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143039433-L.jpg'),
    ('East of Eden', 'John Steinbeck', 'English', 1952, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142004234-L.jpg'),
    ('Catch-22', 'Joseph Heller', 'English', 1961, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781451626650-L.jpg'),
    ('Slaughterhouse-Five', 'Kurt Vonnegut', 'English', 1969, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780440180296-L.jpg'),
    ('The Catcher in the Rye', 'J.D. Salinger', 'English', 1951, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg'),
    ('On the Road', 'Jack Kerouac', 'English', 1957, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140283297-L.jpg'),
    ('Beloved', 'Toni Morrison', 'English', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400033416-L.jpg'),
    ('The Road', 'Cormac McCarthy', 'English', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg'),
    ('The Hobbit', 'J.R.R. Tolkien', 'English', 1937, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg'),
    ('The Fellowship of the Ring', 'J.R.R. Tolkien', 'English', 1954, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780618574940-L.jpg'),
    ('Foundation', 'Isaac Asimov', 'English', 1951, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg'),
    ('Fahrenheit 451', 'Ray Bradbury', 'English', 1953, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg'),
    ('Neuromancer', 'William Gibson', 'English', 1984, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg'),
    ('Do Androids Dream of Electric Sheep?', 'Philip K. Dick', 'English', 1968, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345404473-L.jpg'),
    ('The Hitchhiker''s Guide to the Galaxy', 'Douglas Adams', 'English', 1979, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg'),
    ('On the Origin of Species', 'Charles Darwin', 'English', 1859, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780140432053-L.jpg'),
    ('Man''s Search for Meaning', 'Viktor Frankl', 'German', 1946, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg'),
    ('The Diary of a Young Girl', 'Anne Frank', 'Dutch', 1947, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780553296983-L.jpg'),
    ('Night', 'Elie Wiesel', 'French', 1958, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780374500016-L.jpg'),
    ('In Cold Blood', 'Truman Capote', 'English', 1966, 'Non-Fiction', 'https://covers.openlibrary.org/b/isbn/9780679745587-L.jpg'),
    ('The Remains of the Day', 'Kazuo Ishiguro', 'English', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679731726-L.jpg'),
    ('Never Let Me Go', 'Kazuo Ishiguro', 'English', 2005, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400078776-L.jpg'),
    ('The Kite Runner', 'Khaled Hosseini', 'English', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781594631931-L.jpg'),
    ('Life of Pi', 'Yann Martel', 'English', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156027328-L.jpg'),
    ('Midnight''s Children', 'Salman Rushdie', 'English', 1981, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg'),
    ('The God of Small Things', 'Arundhati Roy', 'English', 1997, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679457312-L.jpg'),
    ('Gitanjali', 'Rabindranath Tagore', 'Bengali', 1910, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780333902981-L.jpg'),
    ('Season of Migration to the North', 'Tayeb Salih', 'Arabic', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780894108501-L.jpg'),
]

# Hand-curated EDITIONS for the works above. Sourced from the original
# database/seed-catalog.sql. Format:
#   (title, author, isbn_13, language, publisher, year, genre,
#    cover_url, original_language, country_of_origin, source, verified)
# Each curated work has 1-3 hand-verified editions with real publisher
# names, ISBN-13s, and Open Library cover URLs.
CURATED_EDITIONS = [
    ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780062316097', 'English', 'Harper', 2015, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780062316097-L.jpg', None, None, 'manual', True),
    ('Sapiens: A Brief History of Humankind', 'Yuval Noah Harari', '9780099590088', 'English', 'Vintage', 2015, 'Non-Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780099590088-L.jpg', None, None, 'manual', True),
    ('Meditations', 'Marcus Aurelius', '9780140449334', 'English', 'Penguin Classics', 2006, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449334-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('Meditations', 'Marcus Aurelius', '9780486298238', 'English', 'Dover', 1997, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780486298238-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('Blood Meridian, or the Evening Redness in the West', 'Cormac McCarthy', '9780679728757', 'English', 'Vintage', 1992, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679728757-L.jpg', None, None, 'manual', True),
    ('Dune', 'Frank Herbert', '9780441172719', 'English', 'Ace', 1990, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/isbn/9780441172719-L.jpg', None, None, 'manual', True),
    ('Dune', 'Frank Herbert', '9780593099322', 'English', 'Ace', 2019, 'Sci-Fi,Fiction', 'https://covers.openlibrary.org/b/id/13186889-L.jpg', None, None, 'manual', True),
    ('Kafka on the Shore', 'Haruki Murakami', '9781400079278', 'English', 'Vintage', 2005, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400079278-L.jpg', 'Japanese', None, 'manual', True),
    ('Umibe no Kafuka', 'Murakami Haruki', '9784101001616', 'Japanese', 'Shinchosha', 2005, 'Fiction', 'https://covers.openlibrary.org/b/id/8471060-L.jpg', None, 'Japan', 'manual', True),
    ('The Stranger', 'Albert Camus', '9780679720201', 'English', 'Vintage', 1989, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780679720201-L.jpg', 'French', None, 'manual', True),
    ('L''Etranger', 'Albert Camus', '9782070360024', 'French', 'Gallimard', 1971, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/8408558-L.jpg', None, 'France', 'manual', True),
    ('Norwegian Wood', 'Haruki Murakami', '9780375704024', 'English', 'Vintage', 2000, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375704024-L.jpg', 'Japanese', None, 'manual', True),
    ('Noruwei no Mori', 'Murakami Haruki', '9784062749497', 'Japanese', 'Kodansha', 2004, 'Fiction', None, None, 'Japan', 'manual', True),
    ('House of Leaves', 'Mark Z. Danielewski', '9780375703768', 'English', 'Pantheon', 2000, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780375703768-L.jpg', None, None, 'manual', True),
    ('The Brothers Karamazov', 'Fyodor Dostoevsky', '9780374528379', 'English', 'Farrar Straus Giroux', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780374528379-L.jpg', 'Russian', None, 'manual', True),
    ('Bratya Karamazovy', 'Fyodor Dostoyevsky', None, 'Russian', 'Eksmo', 2008, 'Fiction', 'https://covers.openlibrary.org/b/id/8409928-L.jpg', None, 'Russian Empire', 'manual', True),
    ('The Master and Margarita', 'Mikhail Bulgakov', '9780141180144', 'English', 'Penguin Classics', 1997, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780141180144-L.jpg', 'Russian', None, 'manual', True),
    ('Master i Margarita', 'Mikhail Bulgakov', '9785170977871', 'Russian', 'AST', 2019, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9785170977871-L.jpg', None, 'USSR / Soviet Union', 'manual', True),
    ('Roadside Picnic', 'Arkady and Boris Strugatsky', '9781613743416', 'English', 'Chicago Review Press', 2012, 'Sci-Fi', 'https://covers.openlibrary.org/b/id/8443792-L.jpg', 'Russian', None, 'manual', True),
    ('Piknik na obochine', 'Arkady i Boris Strugatsky', None, 'Russian', 'Molodaya gvardiya', 1972, 'Sci-Fi', None, None, 'USSR / Soviet Union', 'manual', True),
    ('Crime and Punishment', 'Fyodor Dostoevsky', '9780143058144', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/id/8479260-L.jpg', 'Russian', None, 'manual', True),
    ('Prestupleniye i nakazaniye', 'Fyodor Dostoyevsky', None, 'Russian', 'Eksmo', 2005, 'Fiction', None, None, 'Russian Empire', 'manual', True),
    ('War and Peace', 'Leo Tolstoy', '9780140447934', 'English', 'Penguin Classics', 1982, 'Fiction,History', 'https://covers.openlibrary.org/b/id/8228691-L.jpg', 'Russian', None, 'manual', True),
    ('Voyna i mir', 'Lev Tolstoy', None, 'Russian', 'Azbuka', 2012, 'Fiction,History', None, None, 'Russian Empire', 'manual', True),
    ('The Bridge on the Drina', 'Ivo Andric', '9780226020457', 'English', 'University of Chicago Press', 1977, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9780226020457-L.jpg', 'Serbian', None, 'manual', True),
    ('Na Drini cuprija', 'Ivo Andric', '9788652118038', 'Serbian', 'Prosveta', 1945, 'Fiction,History', 'https://covers.openlibrary.org/b/isbn/9788652118038-L.jpg', None, 'Yugoslavia', 'manual', True),
    ('Death and the Dervish', 'Mesa Selimovic', '9780810112384', 'English', 'Northwestern University Press', 1996, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/id/13127483-L.jpg', 'Bosnian', None, 'manual', True),
    ('Dervis i smrt', 'Mesa Selimovic', None, 'Bosnian', 'Svjetlost', 1966, 'Fiction,Philosophy', None, None, 'Yugoslavia', 'manual', True),
    ('The Damned Yard', 'Ivo Andric', None, 'English', 'Forest Books', 1992, 'Fiction', None, 'Serbian', None, 'manual', True),
    ('Prokleta avlija', 'Ivo Andric', None, 'Serbian', 'Prosveta', 1954, 'Fiction', None, None, 'Yugoslavia', 'manual', True),
    ('A Brief History of Time', 'Stephen Hawking', '9780553380163', 'English', 'Bantam', 1988, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg', None, None, 'manual', True),
    ('A Brief History of Time (Updated Edition)', 'Stephen Hawking', '9780553804577', 'English', 'Bantam', 1998, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780553804577-L.jpg', None, None, 'manual', True),
    ('1984', 'George Orwell', '9780451524935', 'English', 'Signet Classics', 1950, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780451524935-L.jpg', None, None, 'manual', True),
    ('Nineteen Eighty-Four', 'George Orwell', '9780141036144', 'English', 'Penguin Modern Classics', 2004, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780141036144-L.jpg', None, None, 'manual', True),
    ('The Left Hand of Darkness', 'Ursula K. Le Guin', '9780441478125', 'English', 'Ace', 1969, 'Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441478125-L.jpg', None, None, 'manual', True),
    ('The Diaries of Franz Kafka', 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1988, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'German', None, 'manual', True),
    ('Tagebucher', 'Franz Kafka', None, 'German', 'S. Fischer Verlag', 1954, 'Non-Fiction,Biography', None, None, 'Austria-Hungary', 'manual', True),
    ('One Hundred Years of Solitude', 'Gabriel Garcia Marquez', '9780060883287', 'English', 'Harper Perennial', 2006, 'Fiction', 'https://covers.openlibrary.org/b/id/8411716-L.jpg', 'Spanish', None, 'manual', True),
    ('Cien anos de soledad', 'Gabriel Garcia Marquez', '9788497592208', 'Spanish', 'Catedra', 2007, 'Fiction', None, None, 'Colombia', 'manual', True),
    ('Don Quixote', 'Miguel de Cervantes', '9780060934347', 'English', 'Harper Perennial', 2003, 'Fiction', 'https://covers.openlibrary.org/b/id/8416816-L.jpg', 'Spanish', None, 'manual', True),
    ('El ingenioso hidalgo don Quijote', 'Miguel de Cervantes', None, 'Spanish', 'Real Academia Espanola', 2004, 'Fiction', None, None, 'Spain', 'manual', True),
    ('Things Fall Apart', 'Chinua Achebe', '9780385474542', 'English', 'Anchor', 1994, 'Fiction', 'https://covers.openlibrary.org/b/id/8468612-L.jpg', None, 'Nigeria', 'manual', True),
    ('The Divine Comedy', 'Dante Alighieri', '9780142437223', 'English', 'Penguin Classics', 2003, 'Poetry,Fiction', 'https://covers.openlibrary.org/b/id/8470260-L.jpg', 'Italian', None, 'manual', True),
    ('La Divina Commedia', 'Dante Alighieri', None, 'Italian', 'Einaudi', 2014, 'Poetry,Fiction', None, None, 'Italy', 'manual', True),
    ('Hamlet', 'William Shakespeare', '9780743477123', 'English', 'Simon and Schuster', 2003, 'Fiction,Drama', 'https://covers.openlibrary.org/b/id/8471820-L.jpg', None, None, 'manual', True),
    ('Anna Karenina', 'Leo Tolstoy', '9780143035008', 'English', 'Penguin Classics', 2000, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143035008-L.jpg', 'Russian', None, 'manual', True),
    ('Anna Karenina', 'Lev Tolstoy', None, 'Russian', 'Azbuka', 2013, 'Fiction', None, None, 'Russian Empire', 'manual', True),
    ('The Idiot', 'Fyodor Dostoevsky', '9780140447927', 'English', 'Penguin Classics', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140447927-L.jpg', 'Russian', None, 'manual', True),
    ('Notes from Underground', 'Fyodor Dostoevsky', '9780140449136', 'English', 'Penguin Classics', 2009, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140449136-L.jpg', 'Russian', None, 'manual', True),
    ('Dead Souls', 'Nikolai Gogol', '9780140448078', 'English', 'Penguin Classics', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140448078-L.jpg', 'Russian', None, 'manual', True),
    ('We', 'Yevgeny Zamyatin', '9780140185852', 'English', 'Penguin Classics', 1993, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780140185852-L.jpg', 'Russian', None, 'manual', True),
    ('My', 'Evgeniy Zamyatin', None, 'Russian', 'Azbuka', 2008, 'Fiction,Sci-Fi', None, None, 'USSR / Soviet Union', 'manual', True),
    ('Doctor Zhivago', 'Boris Pasternak', '9780375408694', 'English', 'Pantheon', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375408694-L.jpg', 'Russian', None, 'manual', True),
    ('The Trial', 'Franz Kafka', '9780805209068', 'English', 'Schocken', 1999, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780805209068-L.jpg', 'German', None, 'manual', True),
    ('The Metamorphosis', 'Franz Kafka', '9780553213690', 'English', 'Bantam', 1972, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780553213690-L.jpg', 'German', None, 'manual', True),
    ('Siddhartha', 'Hermann Hesse', '9780553208849', 'English', 'Bantam', 1951, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780553208849-L.jpg', 'German', None, 'manual', True),
    ('Steppenwolf', 'Hermann Hesse', '9780312278908', 'English', 'Picador', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312278908-L.jpg', 'German', None, 'manual', True),
    ('The Magic Mountain', 'Thomas Mann', '9780679772873', 'English', 'Vintage', 1996, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679772873-L.jpg', 'German', None, 'manual', True),
    ('Death in Venice', 'Thomas Mann', '9780679722068', 'English', 'Vintage', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679722068-L.jpg', 'German', None, 'manual', True),
    ('The Tin Drum', 'Gunter Grass', '9780156900430', 'English', 'Harvest', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156900430-L.jpg', 'German', None, 'manual', True),
    ('Faust', 'Johann Wolfgang von Goethe', '9780140440201', 'English', 'Penguin Classics', 2005, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780140440201-L.jpg', 'German', None, 'manual', True),
    ('Madame Bovary', 'Gustave Flaubert', '9780143136019', 'English', 'Penguin Classics', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143136019-L.jpg', 'French', None, 'manual', True),
    ('Madame Bovary', 'Gustave Flaubert', '9782070413119', 'French', 'Gallimard', 1972, 'Fiction', None, None, 'France', 'manual', True),
    ('Les Miserables', 'Victor Hugo', '9780140444308', 'English', 'Penguin Classics', 1987, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140444308-L.jpg', 'French', None, 'manual', True),
    ('Les Miserables', 'Victor Hugo', '9782070409228', 'French', 'Gallimard', 2000, 'Fiction', None, None, 'France', 'manual', True),
    ('The Count of Monte Cristo', 'Alexandre Dumas', '9780140449266', 'English', 'Penguin Classics', 1996, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449266-L.jpg', 'French', None, 'manual', True),
    ('Swann''s Way', 'Marcel Proust', '9780142437964', 'English', 'Penguin Classics', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437964-L.jpg', 'French', None, 'manual', True),
    ('Nausea', 'Jean-Paul Sartre', '9780811201224', 'English', 'New Directions', 1964, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780811201224-L.jpg', 'French', None, 'manual', True),
    ('The Plague', 'Albert Camus', '9780679720218', 'English', 'Vintage', 1991, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679720218-L.jpg', 'French', None, 'manual', True),
    ('Waiting for Godot', 'Samuel Beckett', '9780802130341', 'English', 'Grove Press', 1954, 'Fiction,Drama', 'https://covers.openlibrary.org/b/isbn/9780802130341-L.jpg', 'French', None, 'manual', True),
    ('Journey to the End of the Night', 'Louis-Ferdinand Celine', '9780811201889', 'English', 'New Directions', 1983, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811201889-L.jpg', 'French', None, 'manual', True),
    ('The Little Prince', 'Antoine de Saint-Exupery', '9780156012195', 'English', 'Harvest', 2000, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg', 'French', None, 'manual', True),
    ('Le Petit Prince', 'Antoine de Saint-Exupery', '9782070408504', 'French', 'Gallimard', 1993, 'Fiction', None, None, 'France', 'manual', True),
    ('Love in the Time of Cholera', 'Gabriel Garcia Marquez', '9780140157741', 'English', 'Penguin', 1989, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140157741-L.jpg', 'Spanish', None, 'manual', True),
    ('Ficciones', 'Jorge Luis Borges', '9780802130303', 'English', 'Grove Press', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802130303-L.jpg', 'Spanish', None, 'manual', True),
    ('Pedro Paramo', 'Juan Rulfo', '9780802144904', 'English', 'Grove Press', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802144904-L.jpg', 'Spanish', None, 'manual', True),
    ('The House of the Spirits', 'Isabel Allende', '9781501117015', 'English', 'Atria', 2015, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781501117015-L.jpg', 'Spanish', None, 'manual', True),
    ('Blindness', 'Jose Saramago', '9780156007757', 'English', 'Harvest', 1999, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156007757-L.jpg', 'Portuguese', None, 'manual', True),
    ('The Book of Disquiet', 'Fernando Pessoa', '9780141183046', 'English', 'Penguin Classics', 2002, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780141183046-L.jpg', 'Portuguese', None, 'manual', True),
    ('If on a winter''s night a traveler', 'Italo Calvino', '9780156439619', 'English', 'Harvest', 1982, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156439619-L.jpg', 'Italian', None, 'manual', True),
    ('The Name of the Rose', 'Umberto Eco', '9780156001311', 'English', 'Harvest', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156001311-L.jpg', 'Italian', None, 'manual', True),
    ('The Leopard', 'Giuseppe Tomasi di Lampedusa', '9780375714566', 'English', 'Pantheon', 2007, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780375714566-L.jpg', 'Italian', None, 'manual', True),
    ('Snow Country', 'Yasunari Kawabata', '9780679761051', 'English', 'Vintage', 1996, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679761051-L.jpg', 'Japanese', None, 'manual', True),
    ('Yukiguni', 'Kawabata Yasunari', None, 'Japanese', 'Shinchosha', 1948, 'Fiction', None, None, 'Japan', 'manual', True),
    ('No Longer Human', 'Osamu Dazai', '9780811204811', 'English', 'New Directions', 1958, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780811204811-L.jpg', 'Japanese', None, 'manual', True),
    ('The Sound of Waves', 'Yukio Mishima', '9780679752684', 'English', 'Vintage', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679752684-L.jpg', 'Japanese', None, 'manual', True),
    ('1Q84', 'Haruki Murakami', '9780307593313', 'English', 'Knopf', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307593313-L.jpg', 'Japanese', None, 'manual', True),
    ('The Wind-Up Bird Chronicle', 'Haruki Murakami', '9780679775430', 'English', 'Vintage', 1998, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679775430-L.jpg', 'Japanese', None, 'manual', True),
    ('Silence', 'Shusaku Endo', '9780312422608', 'English', 'Picador', 2016, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780312422608-L.jpg', 'Japanese', None, 'manual', True),
    ('Rashomon and Seventeen Other Stories', 'Ryunosuke Akutagawa', '9780140449709', 'English', 'Penguin Classics', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449709-L.jpg', 'Japanese', None, 'manual', True),
    ('Dream of the Red Chamber', 'Cao Xueqin', '9780140443714', 'English', 'Penguin Classics', 1973, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140443714-L.jpg', 'Classical Chinese', None, 'manual', True),
    ('Monkey: A Folk Novel of China', 'Wu Cheng-en', '9780802150219', 'English', 'Grove Press', 1994, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780802150219-L.jpg', 'Classical Chinese', None, 'manual', True),
    ('The Iliad (trans. Robert Fagles)', 'Homer', '9780140447940', 'English', 'Penguin Classics', 1998, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140447940-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('The Iliad (trans. Emily Wilson)', 'Homer', '9780393246414', 'English', 'Norton', 2023, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393246414-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('The Odyssey (trans. Emily Wilson)', 'Homer', '9780393246025', 'English', 'Norton', 2018, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393246025-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('The Odyssey (trans. Robert Fitzgerald)', 'Homer', '9780374525743', 'English', 'Farrar Straus Giroux', 1998, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780374525743-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('The Aeneid (trans. Robert Fagles)', 'Virgil', '9780670038176', 'English', 'Viking', 2006, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780670038176-L.jpg', 'Latin', None, 'manual', True),
    ('The Republic', 'Plato', '9780140455113', 'English', 'Penguin Classics', 2007, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140455113-L.jpg', 'Ancient Greek', None, 'manual', True),
    ('The Art of War', 'Sun Tzu', '9780199540174', 'English', 'Oxford', 2008, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780199540174-L.jpg', 'Classical Chinese', None, 'manual', True),
    ('Tao Te Ching', 'Lao Tzu', '9780140441314', 'English', 'Penguin Classics', 1963, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140441314-L.jpg', 'Classical Chinese', None, 'manual', True),
    ('The Analects', 'Confucius', '9780140443486', 'English', 'Penguin Classics', 1979, 'Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140443486-L.jpg', 'Classical Chinese', None, 'manual', True),
    ('Bhagavad Gita', 'Vyasa', '9780140449181', 'English', 'Penguin Classics', 2003, 'Philosophy,Religion', 'https://covers.openlibrary.org/b/isbn/9780140449181-L.jpg', 'Sanskrit', None, 'manual', True),
    ('Beowulf (trans. Seamus Heaney)', 'Anonymous', '9780393320978', 'English', 'Norton', 2001, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780393320978-L.jpg', 'Old English', None, 'manual', True),
    ('The Canterbury Tales', 'Geoffrey Chaucer', '9780140422344', 'English', 'Penguin Classics', 1951, 'Fiction,Poetry', 'https://covers.openlibrary.org/b/isbn/9780140422344-L.jpg', None, None, 'manual', True),
    ('The Decameron', 'Giovanni Boccaccio', '9780140449303', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140449303-L.jpg', 'Italian', None, 'manual', True),
    ('Paradise Lost', 'John Milton', '9780140424393', 'English', 'Penguin Classics', 2000, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780140424393-L.jpg', None, None, 'manual', True),
    ('Candide', 'Voltaire', '9780140440041', 'English', 'Penguin Classics', 1947, 'Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780140440041-L.jpg', 'French', None, 'manual', True),
    ('Candide', 'Voltaire', '9782070360246', 'French', 'Gallimard', 1992, 'Fiction,Philosophy', None, None, 'France', 'manual', True),
    ('Robinson Crusoe', 'Daniel Defoe', '9780141439822', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439822-L.jpg', None, None, 'manual', True),
    ('Pride and Prejudice', 'Jane Austen', '9780141439518', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439518-L.jpg', None, None, 'manual', True),
    ('Jane Eyre', 'Charlotte Bronte', '9780141441146', 'English', 'Penguin Classics', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141441146-L.jpg', None, None, 'manual', True),
    ('Wuthering Heights', 'Emily Bronte', '9780141439556', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439556-L.jpg', None, None, 'manual', True),
    ('Great Expectations', 'Charles Dickens', '9780141439563', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141439563-L.jpg', None, None, 'manual', True),
    ('Moby-Dick', 'Herman Melville', '9780142437247', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437247-L.jpg', None, None, 'manual', True),
    ('Moby-Dick (Norton Critical Edition)', 'Herman Melville', '9780393972832', 'English', 'Norton', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393972832-L.jpg', None, None, 'manual', True),
    ('The Scarlet Letter', 'Nathaniel Hawthorne', '9780142437261', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437261-L.jpg', None, None, 'manual', True),
    ('Adventures of Huckleberry Finn', 'Mark Twain', '9780142437179', 'English', 'Penguin Classics', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142437179-L.jpg', None, None, 'manual', True),
    ('Dracula', 'Bram Stoker', '9780141439846', 'English', 'Penguin Classics', 2003, 'Fiction,Horror', 'https://covers.openlibrary.org/b/isbn/9780141439846-L.jpg', None, None, 'manual', True),
    ('The Picture of Dorian Gray', 'Oscar Wilde', '9780141442464', 'English', 'Penguin Classics', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780141442464-L.jpg', None, None, 'manual', True),
    ('Ulysses', 'James Joyce', '9780394743127', 'English', 'Vintage', 1990, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780394743127-L.jpg', None, 'Ireland', 'manual', True),
    ('Mrs Dalloway', 'Virginia Woolf', '9780156628709', 'English', 'Harvest', 1981, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156628709-L.jpg', None, None, 'manual', True),
    ('Animal Farm', 'George Orwell', '9780451526342', 'English', 'Signet Classics', 1966, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780451526342-L.jpg', None, None, 'manual', True),
    ('Brave New World', 'Aldous Huxley', '9780060850524', 'English', 'Harper Perennial', 2006, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780060850524-L.jpg', None, None, 'manual', True),
    ('Lord of the Flies', 'William Golding', '9780399501487', 'English', 'Perigee', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780399501487-L.jpg', None, None, 'manual', True),
    ('A Clockwork Orange', 'Anthony Burgess', '9780393312836', 'English', 'Norton', 2012, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780393312836-L.jpg', None, None, 'manual', True),
    ('The Great Gatsby', 'F. Scott Fitzgerald', '9780743273565', 'English', 'Scribner', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg', None, None, 'manual', True),
    ('The Sound and the Fury', 'William Faulkner', '9780679732242', 'English', 'Vintage', 1990, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679732242-L.jpg', None, None, 'manual', True),
    ('To Kill a Mockingbird', 'Harper Lee', '9780061935466', 'English', 'Harper Perennial', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780061935466-L.jpg', None, 'United States', 'manual', True),
    ('The Grapes of Wrath', 'John Steinbeck', '9780143039433', 'English', 'Penguin Classics', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780143039433-L.jpg', None, None, 'manual', True),
    ('East of Eden', 'John Steinbeck', '9780142004234', 'English', 'Penguin', 2002, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780142004234-L.jpg', None, None, 'manual', True),
    ('Catch-22', 'Joseph Heller', '9781451626650', 'English', 'Simon and Schuster', 2011, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781451626650-L.jpg', None, None, 'manual', True),
    ('Slaughterhouse-Five', 'Kurt Vonnegut', '9780440180296', 'English', 'Dell', 1991, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780440180296-L.jpg', None, None, 'manual', True),
    ('The Catcher in the Rye', 'J.D. Salinger', '9780316769174', 'English', 'Little Brown', 2001, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780316769174-L.jpg', None, None, 'manual', True),
    ('On the Road', 'Jack Kerouac', '9780140283297', 'English', 'Penguin', 1999, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780140283297-L.jpg', None, None, 'manual', True),
    ('Beloved', 'Toni Morrison', '9781400033416', 'English', 'Vintage', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400033416-L.jpg', None, 'United States', 'manual', True),
    ('The Road', 'Cormac McCarthy', '9780307387899', 'English', 'Vintage', 2007, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780307387899-L.jpg', None, None, 'manual', True),
    ('The Hobbit', 'J.R.R. Tolkien', '9780547928227', 'English', 'Houghton Mifflin Harcourt', 2012, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780547928227-L.jpg', None, None, 'manual', True),
    ('The Fellowship of the Ring', 'J.R.R. Tolkien', '9780618574940', 'English', 'Houghton Mifflin Harcourt', 2004, 'Fiction,Fantasy', 'https://covers.openlibrary.org/b/isbn/9780618574940-L.jpg', None, None, 'manual', True),
    ('Foundation', 'Isaac Asimov', '9780553293357', 'English', 'Spectra', 1991, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780553293357-L.jpg', None, None, 'manual', True),
    ('Fahrenheit 451', 'Ray Bradbury', '9781451673319', 'English', 'Simon and Schuster', 2012, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9781451673319-L.jpg', None, None, 'manual', True),
    ('Neuromancer', 'William Gibson', '9780441569595', 'English', 'Ace', 1986, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780441569595-L.jpg', None, None, 'manual', True),
    ('Do Androids Dream of Electric Sheep?', 'Philip K. Dick', '9780345404473', 'English', 'Del Rey', 1996, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345404473-L.jpg', None, None, 'manual', True),
    ('The Hitchhiker''s Guide to the Galaxy', 'Douglas Adams', '9780345391803', 'English', 'Del Rey', 1995, 'Fiction,Sci-Fi', 'https://covers.openlibrary.org/b/isbn/9780345391803-L.jpg', None, None, 'manual', True),
    ('On the Origin of Species', 'Charles Darwin', '9780140432053', 'English', 'Penguin Classics', 1985, 'Non-Fiction,Science', 'https://covers.openlibrary.org/b/isbn/9780140432053-L.jpg', None, None, 'manual', True),
    ('Man''s Search for Meaning', 'Viktor Frankl', '9780807014271', 'English', 'Beacon Press', 2006, 'Non-Fiction,Philosophy', 'https://covers.openlibrary.org/b/isbn/9780807014271-L.jpg', 'German', None, 'manual', True),
    ('The Diary of a Young Girl', 'Anne Frank', '9780553296983', 'English', 'Bantam', 1993, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780553296983-L.jpg', 'Dutch', None, 'manual', True),
    ('Night', 'Elie Wiesel', '9780374500016', 'English', 'Hill and Wang', 2006, 'Non-Fiction,Biography', 'https://covers.openlibrary.org/b/isbn/9780374500016-L.jpg', 'French', None, 'manual', True),
    ('In Cold Blood', 'Truman Capote', '9780679745587', 'English', 'Vintage', 1994, 'Non-Fiction', 'https://covers.openlibrary.org/b/isbn/9780679745587-L.jpg', None, None, 'manual', True),
    ('The Remains of the Day', 'Kazuo Ishiguro', '9780679731726', 'English', 'Vintage', 1990, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679731726-L.jpg', None, None, 'manual', True),
    ('Never Let Me Go', 'Kazuo Ishiguro', '9781400078776', 'English', 'Vintage', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781400078776-L.jpg', None, None, 'manual', True),
    ('The Kite Runner', 'Khaled Hosseini', '9781594631931', 'English', 'Riverhead', 2004, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9781594631931-L.jpg', None, 'Afghanistan', 'manual', True),
    ('Life of Pi', 'Yann Martel', '9780156027328', 'English', 'Harvest', 2003, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780156027328-L.jpg', None, None, 'manual', True),
    ('Midnight''s Children', 'Salman Rushdie', '9780812976533', 'English', 'Random House', 2006, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780812976533-L.jpg', None, 'India', 'manual', True),
    ('The God of Small Things', 'Arundhati Roy', '9780679457312', 'English', 'Random House', 1997, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780679457312-L.jpg', None, 'India', 'manual', True),
    ('Gitanjali', 'Rabindranath Tagore', '9780333902981', 'English', 'Macmillan', 1913, 'Poetry', 'https://covers.openlibrary.org/b/isbn/9780333902981-L.jpg', 'Bengali', 'British India', 'manual', True),
    ('Season of Migration to the North', 'Tayeb Salih', '9780894108501', 'English', 'NYRB Classics', 2009, 'Fiction', 'https://covers.openlibrary.org/b/isbn/9780894108501-L.jpg', 'Arabic', 'Sudan', 'manual', True),
]

# Goodreads two-letter / ISO-639-2 language codes -> human-readable names
# matching the style used elsewhere in the repo.
LANG_MAP = {
    "eng": "English", "en-US": "English", "en-GB": "English", "en-CA": "English",
    "en": "English",
    "spa": "Spanish", "es": "Spanish",
    "fre": "French", "fra": "French", "fr": "French",
    "ger": "German", "deu": "German", "de": "German",
    "ita": "Italian", "it": "Italian",
    "por": "Portuguese", "pt": "Portuguese", "pt-BR": "Portuguese",
    "rus": "Russian", "ru": "Russian",
    "jpn": "Japanese", "ja": "Japanese",
    "chi": "Chinese", "zh": "Chinese", "zho": "Chinese",
    "kor": "Korean", "ko": "Korean",
    "ara": "Arabic", "ar": "Arabic",
    "hin": "Hindi", "hi": "Hindi",
    "ben": "Bengali", "bn": "Bengali",
    "tur": "Turkish", "tr": "Turkish",
    "per": "Persian", "fas": "Persian", "fa": "Persian",
    "pol": "Polish", "pl": "Polish",
    "dut": "Dutch", "nld": "Dutch", "nl": "Dutch",
    "swe": "Swedish", "sv": "Swedish",
    "nor": "Norwegian", "no": "Norwegian", "nob": "Norwegian",
    "dan": "Danish", "da": "Danish",
    "fin": "Finnish", "fi": "Finnish",
    "gre": "Greek", "ell": "Greek", "el": "Greek",
    "heb": "Hebrew", "he": "Hebrew",
    "lat": "Latin", "la": "Latin",
    "vie": "Vietnamese", "vi": "Vietnamese",
    "tha": "Thai", "th": "Thai",
    "ind": "Indonesian", "id": "Indonesian",
    "cze": "Czech", "ces": "Czech", "cs": "Czech",
    "hun": "Hungarian", "hu": "Hungarian",
    "rom": "Romanian", "ron": "Romanian", "ro": "Romanian",
    "ukr": "Ukrainian", "uk": "Ukrainian",
    "srp": "Serbian", "sr": "Serbian",
    "hrv": "Croatian", "hr": "Croatian",
    "bul": "Bulgarian", "bg": "Bulgarian",
    "slv": "Slovenian", "sl": "Slovenian",
    "slk": "Slovak", "sk": "Slovak",
    "cat": "Catalan", "ca": "Catalan",
}

# Goodreads tag -> normalized genre token (matches existing repo style).
# Order matters only for readability; multiple tags can map to the same genre.
# Tags not in this map are treated as non-genre user shelves and ignored.
TAG_TO_GENRE = {
    "fiction": "Fiction",
    "non-fiction": "Non-Fiction",
    "nonfiction": "Non-Fiction",
    "fantasy": "Fantasy",
    "science-fiction": "Sci-Fi",
    "sci-fi": "Sci-Fi",
    "scifi": "Sci-Fi",
    "mystery": "Mystery",
    "thriller": "Thriller",
    "horror": "Horror",
    "romance": "Romance",
    "historical-fiction": "Historical Fiction",
    "historical": "Historical Fiction",
    "history": "History",
    "biography": "Biography",
    "memoir": "Memoir",
    "autobiography": "Biography",
    "young-adult": "Young Adult",
    "ya": "Young Adult",
    "childrens": "Children's",
    "children": "Children's",
    "middle-grade": "Children's",
    "picture-books": "Children's",
    "classics": "Classics",
    "classic": "Classics",
    "poetry": "Poetry",
    "drama": "Drama",
    "plays": "Drama",
    "philosophy": "Philosophy",
    "religion": "Religion",
    "christian": "Religion",
    "spirituality": "Religion",
    "self-help": "Self-Help",
    "business": "Business",
    "economics": "Business",
    "science": "Science",
    "psychology": "Psychology",
    "graphic-novels": "Graphic Novel",
    "comics": "Graphic Novel",
    "manga": "Manga",
    "short-stories": "Short Stories",
    "essays": "Essays",
    "travel": "Travel",
    "cookbooks": "Cooking",
    "cooking": "Cooking",
    "food": "Cooking",
    "art": "Art",
    "music": "Music",
    "politics": "Politics",
    "true-crime": "True Crime",
    "war": "History",
    "dystopia": "Sci-Fi",
    "paranormal": "Fantasy",
    "urban-fantasy": "Fantasy",
    "high-fantasy": "Fantasy",
    "epic-fantasy": "Fantasy",
    "literary-fiction": "Fiction",
    "contemporary": "Fiction",
    "humor": "Humor",
    "comedy": "Humor",
    "adventure": "Adventure",
    "westerns": "Western",
    "western": "Western",
    "lgbt": "LGBTQ+",
    "lgbtq": "LGBTQ+",
    "queer": "LGBTQ+",
}

CSV_FIELDS = [
    "unshelvd_work_id", "unshelvd_edition_id",
    "work_title", "work_author", "title", "author",
    "isbn13", "isbn10", "language", "publisher",
    "publication_year", "genre", "cover_url",
    "original_language", "country_of_origin", "source",
]


def download_if_missing(cache_dir: Path) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    for fname, url in SOURCES.items():
        target = cache_dir / fname
        if target.exists() and target.stat().st_size > 0:
            continue
        print(f"Downloading {url} -> {target}")
        with urllib.request.urlopen(url, timeout=60) as resp, open(target, "wb") as out:
            out.write(resp.read())


def pad_isbn10(value: str) -> Optional[str]:
    """goodbooks stores isbn-10 as an integer, losing leading zeros."""
    if not value:
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return None
    if len(digits) > 10:
        return None
    return digits.rjust(10, "0")


def isbn13_from_isbn10(isbn10: str) -> Optional[str]:
    """Compute ISBN-13 from a 10-digit ISBN. Returns None on bad input."""
    if not isbn10 or len(isbn10) != 10:
        return None
    body = "978" + isbn10[:9]
    if not body.isdigit():
        return None
    total = 0
    for i, ch in enumerate(body):
        n = int(ch)
        total += n if i % 2 == 0 else n * 3
    check = (10 - (total % 10)) % 10
    return body + str(check)


def normalize_isbn13(raw: str, isbn10: Optional[str]) -> Optional[str]:
    """The dataset stores ISBN-13 as a float in scientific notation, so we
    prefer to recompute it from the (zero-padded) ISBN-10 when possible."""
    if isbn10:
        recomputed = isbn13_from_isbn10(isbn10)
        if recomputed:
            return recomputed
    if not raw:
        return None
    try:
        if "e" in raw.lower() or "." in raw:
            value = int(float(raw))
        else:
            value = int(raw)
    except (TypeError, ValueError):
        return None
    text = str(value)
    if len(text) == 13:
        return text
    return None


def map_language(code: str) -> str:
    if not code:
        return "English"
    code = code.strip()
    if code in LANG_MAP:
        return LANG_MAP[code]
    base = code.split("-")[0].lower()
    return LANG_MAP.get(base, "English")


def load_genre_index(book_tags_path: Path, tags_path: Path) -> Dict[str, str]:
    """Return a mapping of goodreads_book_id -> comma-separated genres,
    chosen from the recognized TAG_TO_GENRE whitelist, ordered by
    popularity (count) within each book."""
    tag_id_to_name: Dict[str, str] = {}
    with open(tags_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag_id_to_name[row["tag_id"]] = row["tag_name"].strip().lower()

    per_book_genres: Dict[str, List[Tuple[int, str]]] = defaultdict(list)
    with open(book_tags_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag_name = tag_id_to_name.get(row["tag_id"])
            if not tag_name:
                continue
            genre = TAG_TO_GENRE.get(tag_name)
            if not genre:
                continue
            try:
                count = int(row["count"])
            except (TypeError, ValueError):
                continue
            per_book_genres[row["goodreads_book_id"]].append((count, genre))

    out: Dict[str, str] = {}
    for book_id, entries in per_book_genres.items():
        entries.sort(key=lambda x: -x[0])
        seen: List[str] = []
        for _count, genre in entries:
            if genre not in seen:
                seen.append(genre)
            if len(seen) >= 3:
                break
        if seen:
            out[book_id] = ",".join(seen)
    return out


def load_curated_rows(path: Path) -> List[Dict[str, str]]:
    """Read the previously generated CSV, but only return rows that
    correspond to hand-curated works (i.e. works whose work-key is in
    CURATED_WORKS). This makes the generator self-bootstrapping: the
    goodbooks-10k and Book-Crossing rows are always re-derived from
    their source datasets, so re-running with an existing catalog.csv
    yields the same output as running from scratch."""
    if not path.exists():
        return []
    curated_keys = {(t, a) for t, a, *_ in CURATED_WORKS}
    out: List[Dict[str, str]] = []
    with open(path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            wt = (row.get("work_title") or "").strip()
            wa = (row.get("work_author") or "").strip()
            if (wt, wa) in curated_keys:
                out.append(row)
    return out


def parse_year(raw: str) -> Optional[int]:
    if not raw:
        return None
    try:
        # goodbooks stores year as a float (e.g. "2008.0"); some rows are
        # negative (BCE) — keep the integer year as-is.
        year = int(float(raw))
    except (TypeError, ValueError):
        return None
    if year < -3000 or year > 2100:
        return None
    return year


_PAREN_RE = re.compile(r"\s*\([^()]*\)\s*$")


def clean_title(raw: str) -> str:
    """Strip series / publisher suffixes like ' (The Hunger Games, #1)'
    or ' (Penguin Classics)' for the canonical work title; the full
    edition title is kept separately."""
    title = (raw or "").strip()
    # Strip up to two trailing parenthesized phrases — Book-Crossing rows
    # often have nested suffixes like "Title (Series, #1) (Edition)".
    for _ in range(2):
        new = _PAREN_RE.sub("", title).strip()
        if new == title:
            break
        title = new
    return title


def primary_author(raw: str) -> str:
    """Datasets list co-authors comma-separated; use the first as the
    canonical author."""
    if not raw:
        return ""
    return raw.split(",")[0].strip()


_NORM_PUNCT_RE = re.compile(r"[^\w\s]")
_NORM_WS_RE = re.compile(r"\s+")
_LEADING_ARTICLE_RE = re.compile(r"^(the|a|an)\s+", re.I)


def norm_title(raw: str) -> str:
    """Canonical lowercased title for cross-dataset matching: strip
    series/publisher suffixes, leading article, punctuation, collapse
    whitespace."""
    cleaned = clean_title(raw).lower()
    cleaned = _LEADING_ARTICLE_RE.sub("", cleaned)
    cleaned = _NORM_PUNCT_RE.sub(" ", cleaned)
    return _NORM_WS_RE.sub(" ", cleaned).strip()


def author_last_name(raw: str) -> str:
    """Lowercase last token of the primary author. Used as a forgiving
    fallback when full-name match fails (BX often abbreviates middle
    names or omits suffixes)."""
    primary = primary_author(raw).lower()
    primary = _NORM_PUNCT_RE.sub(" ", primary)
    parts = _NORM_WS_RE.sub(" ", primary).strip().split()
    return parts[-1] if parts else ""


def cover_for(isbn13: Optional[str], isbn10: Optional[str],
              fallback: Optional[str] = None) -> Optional[str]:
    """Prefer the stable Open Library cover URL when an ISBN is known."""
    if isbn13:
        return f"https://covers.openlibrary.org/b/isbn/{isbn13}-L.jpg"
    if isbn10:
        return f"https://covers.openlibrary.org/b/isbn/{isbn10}-L.jpg"
    if fallback and "nophoto" not in fallback and "amazon.com" not in fallback:
        return fallback
    return None


# ──────────────────────────────────────────────────────────────────────
# Source loaders
# ──────────────────────────────────────────────────────────────────────

def load_genre_index(book_tags_path: Path, tags_path: Path) -> Dict[str, str]:
    """Return a mapping of goodreads_book_id -> comma-separated genres."""
    tag_id_to_name: Dict[str, str] = {}
    with open(tags_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tag_id_to_name[row["tag_id"]] = row["tag_name"].strip().lower()

    per_book: Dict[str, List[Tuple[int, str]]] = defaultdict(list)
    with open(book_tags_path, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tag_name = tag_id_to_name.get(row["tag_id"])
            if not tag_name:
                continue
            genre = TAG_TO_GENRE.get(tag_name)
            if not genre:
                continue
            try:
                count = int(row["count"])
            except (TypeError, ValueError):
                continue
            per_book[row["goodreads_book_id"]].append((count, genre))

    out: Dict[str, str] = {}
    for book_id, entries in per_book.items():
        entries.sort(key=lambda x: -x[0])
        seen: List[str] = []
        for _count, genre in entries:
            if genre not in seen:
                seen.append(genre)
            if len(seen) >= 3:
                break
        if seen:
            out[book_id] = ",".join(seen)
    return out


# Edition tuple as returned by source loaders. A bag of normalised fields
# that get folded into a Work below.
class Edition(dict):
    """Just a typed-ish dict for clarity."""
    # Required: title, author, isbn13 OR isbn10 (one of them), source
    # Optional: publisher, publication_year, language, genre, cover_url


def load_goodbooks(books_path: Path,
                   genre_index: Dict[str, str]) -> List[Tuple[Edition, str, str]]:
    """Yield (edition, work_title, work_author) tuples from goodbooks-10k.
    One canonical edition per work."""
    out = []
    with open(books_path, encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            isbn10 = pad_isbn10(raw.get("isbn") or "")
            isbn13 = normalize_isbn13(raw.get("isbn13") or "", isbn10)
            edition_title = (raw.get("title") or "").strip()
            if not edition_title:
                continue
            author = primary_author(raw.get("authors") or "")
            if not author:
                continue
            work_title = clean_title(
                (raw.get("original_title") or "").strip() or edition_title
            )
            year = parse_year(raw.get("original_publication_year") or "")
            ed = Edition(
                title=edition_title,
                author=author,
                isbn13=isbn13 or "",
                isbn10=isbn10 or "",
                language=map_language(raw.get("language_code") or ""),
                publisher="",
                publication_year=year,
                genre=genre_index.get(raw.get("goodreads_book_id") or "", ""),
                cover_url=cover_for(isbn13, isbn10, raw.get("image_url")),
                original_language="",
                country_of_origin="",
                source="goodbooks-10k",
            )
            out.append((ed, work_title, author))
    return out


def load_bookcrossing(bx_path: Path) -> List[Tuple[Edition, str, str]]:
    """Yield (edition, work_title, work_author) tuples from Book-Crossing.
    The dataset uses ';'-delimited, '"'-quoted latin-1 CSV."""
    out = []
    with open(bx_path, encoding="latin-1", newline="") as f:
        reader = csv.reader(f, delimiter=";", quotechar='"')
        next(reader, None)  # header
        for r in reader:
            if len(r) < 5:
                continue
            isbn_raw, ed_title, ed_author, year_raw, publisher = r[0], r[1], r[2], r[3], r[4]
            ed_title = (ed_title or "").strip()
            ed_author = (ed_author or "").strip()
            if not ed_title or not ed_author:
                continue
            isbn10 = pad_isbn10(isbn_raw)
            if not isbn10:
                # Some rows have ISBN-13s in this slot; try parsing as 13.
                digits = "".join(ch for ch in (isbn_raw or "") if ch.isdigit())
                isbn13 = digits if len(digits) == 13 else None
                isbn10 = None
            else:
                isbn13 = isbn13_from_isbn10(isbn10)
            if not (isbn10 or isbn13):
                continue
            year = parse_year(year_raw)
            # Sanity: BX has rows with year=0 or year=2050 garbage.
            if year is not None and (year < 1450 or year > 2025):
                year = None
            work_title = clean_title(ed_title)
            work_author = primary_author(ed_author)
            ed = Edition(
                title=ed_title,
                author=ed_author,
                isbn13=isbn13 or "",
                isbn10=isbn10 or "",
                language="English",  # BX is overwhelmingly English
                publisher=(publisher or "").strip(),
                publication_year=year,
                genre="",
                cover_url=cover_for(isbn13, isbn10, None),
                original_language="",
                country_of_origin="",
                source="book-crossing",
            )
            out.append((ed, work_title, work_author))
    return out


# ──────────────────────────────────────────────────────────────────────
# Catalog assembly
# ──────────────────────────────────────────────────────────────────────

def build_catalog(
    curated: List[Dict[str, str]],
    goodbooks: List[Tuple[Edition, str, str]],
    bookcrossing: List[Tuple[Edition, str, str]],
    editions_per_work: int,
) -> List[Dict[str, str]]:
    """Merge the three sources into a single deterministic catalog.

    Returns a flat list of edition dicts, one per emitted catalog row,
    sorted globally by (work_id, edition_id) so output is stable.

    Algorithm:
      1. Seed the work universe from curated rows + every goodbooks work
         (each contributes 1 canonical edition).
      2. Build a (norm_title, norm_author_last) index over the works.
      3. For each BX edition, look up its work in the index. If the work
         exists, attach the BX edition. If not, AND there is at least
         one other BX edition for the same key, create a new BX-only
         work and attach it. (This avoids inflating the catalog with
         singleton obscure BX rows.)
      4. Cap each work at `editions_per_work` editions, deduped by ISBN.
      5. Sort works deterministically and assign Unshelv'd catalog IDs.
    """

    # works keyed by canonical (work_title, work_author) string tuple
    works: Dict[Tuple[str, str], Dict] = {}
    # secondary index for BX matching: (norm_title, last_name) -> work_key
    norm_index: Dict[Tuple[str, str], Tuple[str, str]] = {}

    # Index curated work-level metadata (original language, etc.)
    curated_meta = {
        (title, author): (orig_lang, year, genre, cover)
        for title, author, orig_lang, year, genre, cover in CURATED_WORKS
    }

    def ensure_work(work_title: str, work_author: str,
                    seed_meta: Optional[Dict] = None) -> Dict:
        key = (work_title, work_author)
        if key in works:
            return works[key]
        meta = curated_meta.get(key)
        original_language = (meta[0] if meta else None) or (
            seed_meta.get("language") if seed_meta else None
        )
        first_year = (meta[1] if meta else None)
        if first_year is None and seed_meta is not None:
            first_year = seed_meta.get("publication_year")
        genre = (meta[2] if meta else None) or (
            (seed_meta or {}).get("genre") or ""
        )
        cover = (meta[3] if meta else None) or (
            (seed_meta or {}).get("cover_url") or ""
        )
        work = {
            "work_title": work_title,
            "work_author": work_author,
            "original_language": original_language or "",
            "first_published_year": first_year,
            "genre": genre,
            "cover_url": cover,
            "editions": [],
            "edition_keys": set(),  # ISBN-13 / ISBN-10 dedup
        }
        works[key] = work
        norm_key = (norm_title(work_title), author_last_name(work_author))
        # Don't overwrite — first writer wins for ambiguous keys.
        norm_index.setdefault(norm_key, key)
        return work

    def attach_edition(work: Dict, edition: Edition) -> bool:
        # Dedup by ISBN (13 preferred, else 10, else title+publisher).
        ek_isbn13 = edition.get("isbn13") or ""
        ek_isbn10 = edition.get("isbn10") or ""
        ek_fallback = (
            edition.get("title", ""), edition.get("publisher", ""),
            str(edition.get("publication_year") or "")
        )
        keys = []
        if ek_isbn13:
            keys.append(("isbn13", ek_isbn13))
        if ek_isbn10:
            keys.append(("isbn10", ek_isbn10))
        if not keys:
            keys.append(("fallback", ek_fallback))
        if any(k in work["edition_keys"] for k in keys):
            return False
        for k in keys:
            work["edition_keys"].add(k)
        work["editions"].append(edition)
        return True

    # 1) Curated bootstrap: every CURATED_WORKS entry becomes a work,
    #    and every CURATED_EDITIONS entry becomes an edition. These are
    #    the hand-verified seeds (international classics + accurate
    #    publisher info) that anchor the catalog independently of the
    #    bulk datasets. Done before goodbooks/BX so curated metadata
    #    wins on conflicts.
    for title, author, orig_lang, year, genre, cover in CURATED_WORKS:
        ensure_work(title, author)
    for (ed_title, ed_author, isbn13, language, publisher, year, genre,
         cover_url, orig_lang, country, source, _verified) in CURATED_EDITIONS:
        # Find the matching work — curated editions always belong to a
        # CURATED_WORKS entry. Match on (work_title, work_author) using
        # the edition's title/author since CURATED_EDITIONS uses the
        # same canonical strings.
        wt = clean_title(ed_title)
        wa = primary_author(ed_author)
        # Try the obvious key first, then fall back to fuzzy.
        key = (wt, wa)
        if key not in works:
            # Some curated edition titles include a longer subtitle than
            # the work title (e.g. "Blood Meridian, or the Evening
            # Redness in the West"). Resolve by normalized lookup.
            nkey = (norm_title(wt), author_last_name(wa))
            existing = norm_index.get(nkey)
            if existing is None:
                # No matching work — synthesize one (rare).
                work = ensure_work(wt, wa)
            else:
                work = works[existing]
        else:
            work = works[key]
        ed = Edition(
            title=ed_title,
            author=ed_author,
            isbn13=isbn13 or "",
            isbn10="",
            language=language or "English",
            publisher=publisher or "",
            publication_year=year,
            genre=genre or "",
            cover_url=cover_url or "",
            original_language=orig_lang or "",
            country_of_origin=country or "",
            source="curated",
        )
        attach_edition(work, ed)

    # 2) Curated CSV passthrough — only for hand-curated rows that may
    #    have additional editions beyond CURATED_EDITIONS. We filter to
    #    rows whose (work_title, work_author) is in CURATED_WORKS so the
    #    goodbooks/BX rows get re-derived from their source datasets
    #    (ensures byte-stable output across regenerations).
    for row in curated:
        wt = (row.get("work_title") or "").strip()
        wa = (row.get("work_author") or "").strip()
        if not wt or not wa:
            continue
        work = ensure_work(wt, wa)
        ed = Edition(
            title=(row.get("title") or "").strip() or wt,
            author=(row.get("author") or "").strip() or wa,
            isbn13=(row.get("isbn13") or "").strip(),
            isbn10=(row.get("isbn10") or "").strip(),
            language=(row.get("language") or "").strip() or "English",
            publisher=(row.get("publisher") or "").strip(),
            publication_year=parse_year(row.get("publication_year") or ""),
            genre=(row.get("genre") or "").strip(),
            cover_url=(row.get("cover_url") or "").strip(),
            original_language=(row.get("original_language") or "").strip(),
            country_of_origin=(row.get("country_of_origin") or "").strip(),
            source=(row.get("source") or "").strip() or "curated",
        )
        attach_edition(work, ed)

    # 2) Goodbooks — every row is a canonical edition for a work.
    for ed, wt, wa in goodbooks:
        work = ensure_work(wt, wa, seed_meta=ed)
        attach_edition(work, ed)

    # 3) Book-Crossing — first pass groups by normalized key; second
    #    pass attaches them or creates BX-only multi-edition works.
    bx_by_key: Dict[Tuple[str, str], List[Tuple[Edition, str, str]]] = defaultdict(list)
    for ed, wt, wa in bookcrossing:
        key = (norm_title(wt), author_last_name(wa))
        if key[0] and key[1]:
            bx_by_key[key].append((ed, wt, wa))

    for nkey, group in bx_by_key.items():
        # Attach to existing work if there is one.
        existing = norm_index.get(nkey)
        if existing is not None:
            work = works[existing]
            for ed, _wt, _wa in group:
                attach_edition(work, ed)
            continue
        # Otherwise only create a new BX-only work if it actually has
        # multiple editions (≥2). Pick the canonical title/author from
        # the most-common-cased variant in the group.
        if len(group) < 2:
            continue
        title_counts: Dict[str, int] = defaultdict(int)
        author_counts: Dict[str, int] = defaultdict(int)
        for ed, wt, wa in group:
            title_counts[clean_title(wt)] += 1
            author_counts[primary_author(wa)] += 1
        canon_title = max(title_counts, key=lambda k: (title_counts[k], k))
        canon_author = max(author_counts, key=lambda k: (author_counts[k], k))
        if not canon_title or not canon_author:
            continue
        work = ensure_work(canon_title, canon_author, seed_meta=group[0][0])
        for ed, _wt, _wa in group:
            attach_edition(work, ed)

    # 4) Cap editions per work, prefer those with publisher + year known,
    #    then by year, then by ISBN13 for stable order.
    for work in works.values():
        editions = work["editions"]

        def edition_sort_key(e: Edition) -> Tuple:
            return (
                # Prefer editions with publisher info
                0 if e.get("publisher") else 1,
                # Then prefer those with a year
                0 if e.get("publication_year") is not None else 1,
                # Stable secondary order
                int(e.get("publication_year") or 0),
                e.get("isbn13") or "",
                e.get("isbn10") or "",
                e.get("title") or "",
            )

        editions.sort(key=edition_sort_key)
        if len(editions) > editions_per_work:
            work["editions"] = editions[:editions_per_work]

    # 5) Assign Unshelv'd catalog IDs in deterministic order.
    work_keys = sorted(
        works.keys(),
        key=lambda k: (k[0].lower(), k[1].lower(), k[0], k[1]),
    )

    rows: List[Dict[str, str]] = []
    for index, key in enumerate(work_keys, start=1):
        work = works[key]
        work_id = f"UN{index:08d}W"
        # Stable order for editions within a work.
        editions = sorted(
            work["editions"],
            key=lambda e: (
                int(e.get("publication_year") or 0),
                e.get("isbn13") or "",
                e.get("isbn10") or "",
                e.get("title") or "",
            ),
        )
        for e_index, ed in enumerate(editions, start=1):
            edition_id = f"{work_id}-E{e_index:03d}"
            rows.append({
                "unshelvd_work_id": work_id,
                "unshelvd_edition_id": edition_id,
                "work_title": work["work_title"],
                "work_author": work["work_author"],
                # Work-level metadata, repeated on every row of the work
                # so the SQL writer can use the first row to reconstruct
                # the parent works row without losing any fields.
                "_work_original_language": work.get("original_language") or "",
                "_work_first_published_year": (
                    str(work["first_published_year"])
                    if work.get("first_published_year") is not None else ""
                ),
                "_work_genre": work.get("genre") or "",
                "_work_cover_url": work.get("cover_url") or "",
                "title": ed.get("title", ""),
                "author": ed.get("author", ""),
                "isbn13": ed.get("isbn13", ""),
                "isbn10": ed.get("isbn10", ""),
                "language": ed.get("language", "") or "English",
                "publisher": ed.get("publisher", ""),
                "publication_year": (
                    str(ed.get("publication_year"))
                    if ed.get("publication_year") is not None else ""
                ),
                "genre": ed.get("genre", "") or work.get("genre", "") or "",
                "cover_url": ed.get("cover_url", "") or work.get("cover_url", "") or "",
                "original_language": (
                    ed.get("original_language", "")
                    or work.get("original_language", "") or ""
                ),
                "country_of_origin": ed.get("country_of_origin", "") or "",
                "source": ed.get("source", ""),
            })
    return rows


def write_csv(rows: List[Dict[str, str]], path: Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in CSV_FIELDS})


def sql_quote(value: Optional[str]) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_int(value: Optional[str]) -> str:
    if value is None or value == "":
        return "NULL"
    try:
        return str(int(value))
    except (TypeError, ValueError):
        return "NULL"


def write_sql(rows: List[Dict[str, str]], path: Path,
              batch_size: int = 250) -> None:
    """Emit batched multi-row INSERTs. Idempotent via the unique
    `unshelvd_id` columns added by migration 0010."""

    # Build per-work metadata so each work is inserted exactly once.
    works_seen: Dict[str, Dict[str, str]] = {}
    work_order: List[str] = []
    for row in rows:
        wid = row["unshelvd_work_id"]
        if wid in works_seen:
            continue
        works_seen[wid] = row
        work_order.append(wid)

    with open(path, "w", encoding="utf-8") as f:
        f.write(
            "-- ============================================================\n"
            "-- Unshelv'd -- Comprehensive Catalog Seed Data\n"
            "-- PostgreSQL (Amazon RDS / standard PostgreSQL 13+)\n"
            "--\n"
            "-- AUTOGENERATED by scripts/build-seed-from-goodbooks.py from:\n"
            "--   * the hand-curated CURATED_WORKS list in that script\n"
            "--   * the goodbooks-10k dataset\n"
            "--     (https://github.com/zygmuntz/goodbooks-10k, CC BY-SA 4.0)\n"
            "--   * the Book-Crossing dataset (Cai-Nicolas Ziegler, 2004)\n"
            "--     mirrored on GitHub LFS — only factual fields used\n"
            "--\n"
            "-- Every work has a stable Unshelv'd catalog ID like\n"
            "--   UN00000042W\n"
            "-- and every edition has an ID like\n"
            "--   UN00000042W-E003\n"
            "-- so the work<->edition link is visible in the ID itself.\n"
            "--\n"
            "-- Idempotent: re-running this file on an already-seeded\n"
            "-- database is a no-op (dedup is via unshelvd_id, the unique\n"
            "-- index added in migration 0010_unshelvd_catalog_ids.sql).\n"
            "--\n"
            "-- Usage (psql):\n"
            "--   psql \"$DATABASE_URL\" -f database/seed-catalog.sql\n"
            "-- ============================================================\n\n"
        )

        # ── Works ───────────────────────────────────────────────────
        f.write("-- Works (one row per abstract literary work)\n")
        for i in range(0, len(work_order), batch_size):
            chunk = work_order[i:i + batch_size]
            f.write(
                "INSERT INTO works (unshelvd_id, title, author, "
                "original_language, first_published_year, genre, "
                "cover_url, source, verified) VALUES\n"
            )
            values = []
            for wid in chunk:
                row = works_seen[wid]
                year = row.get("_work_first_published_year") or ""
                values.append(
                    "  ("
                    + sql_quote(wid) + ", "
                    + sql_quote(row["work_title"]) + ", "
                    + sql_quote(row["work_author"]) + ", "
                    + sql_quote(row.get("_work_original_language") or None) + ", "
                    + (sql_int(year) if year else "NULL") + "::int, "
                    + sql_quote(row.get("_work_genre") or None) + ", "
                    + sql_quote(row.get("_work_cover_url") or None) + ", "
                    + "'manual', true)"
                )
            f.write(",\n".join(values))
            f.write("\nON CONFLICT (unshelvd_id) DO NOTHING;\n\n")

        # ── Book catalog editions ──────────────────────────────────
        f.write(
            "-- Book catalog editions linked back to the works table\n"
            "-- via the unshelvd_id pair encoded in unshelvd_edition_id.\n"
        )
        for i in range(0, len(rows), batch_size):
            chunk = rows[i:i + batch_size]
            f.write(
                "WITH edition_data (unshelvd_edition_id, unshelvd_work_id, "
                "title, author, isbn_10, isbn_13, language, publisher, "
                "publication_year, genre, cover_url, original_language, "
                "country_of_origin) AS (VALUES\n"
            )
            values = []
            for row in chunk:
                year = sql_int(row.get("publication_year"))
                values.append(
                    "  ("
                    + sql_quote(row["unshelvd_edition_id"]) + ", "
                    + sql_quote(row["unshelvd_work_id"]) + ", "
                    + sql_quote(row["title"]) + ", "
                    + sql_quote(row["author"]) + ", "
                    + sql_quote(row["isbn10"] or None) + ", "
                    + sql_quote(row["isbn13"] or None) + ", "
                    + sql_quote(row["language"] or "English") + ", "
                    + sql_quote(row["publisher"] or None) + ", "
                    + (year if year != "NULL" else "NULL::int") + ", "
                    + sql_quote(row["genre"] or None) + ", "
                    + sql_quote(row["cover_url"] or None) + ", "
                    + sql_quote(row["original_language"] or None) + ", "
                    + sql_quote(row["country_of_origin"] or None) + ")"
                )
            f.write(",\n".join(values))
            f.write(
                "\n)\n"
                "INSERT INTO book_catalog (unshelvd_id, title, author, "
                "isbn_10, isbn_13, language, publisher, publication_year, "
                "genre, cover_url, original_language, country_of_origin, "
                "work_id, source, verified)\n"
                "SELECT e.unshelvd_edition_id, e.title, e.author, "
                "e.isbn_10, e.isbn_13, e.language, e.publisher, "
                "e.publication_year, e.genre, e.cover_url, "
                "e.original_language, e.country_of_origin,\n"
                "  (SELECT w.id FROM works w WHERE w.unshelvd_id = e.unshelvd_work_id LIMIT 1),\n"
                "  'manual', true\n"
                "FROM edition_data e\n"
                "ON CONFLICT (unshelvd_id) DO NOTHING;\n\n"
            )

        # ── Refresh denormalized edition counts ────────────────────
        f.write(
            "-- Refresh denormalized counts on works\n"
            "UPDATE works w SET edition_count = sub.cnt\n"
            "FROM (\n"
            "  SELECT work_id, COUNT(*) AS cnt FROM book_catalog\n"
            "  WHERE work_id IS NOT NULL GROUP BY work_id\n"
            ") sub\n"
            "WHERE w.id = sub.work_id;\n"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", default="/tmp/seed",
                        help="directory to cache the downloaded source CSVs")
    parser.add_argument("--editions-per-work", type=int, default=6,
                        help="cap editions per work in the output (default: 6)")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    download_if_missing(cache_dir)

    books_path = cache_dir / "books.csv"
    book_tags_path = cache_dir / "book_tags.csv"
    tags_path = cache_dir / "tags.csv"
    bx_path = cache_dir / "BX_Books.csv"

    print(f"Loading curated rows from {EXISTING_CSV}")
    curated = load_curated_rows(EXISTING_CSV)
    print(f"  -> {len(curated)} curated rows preserved")

    print("Loading genre index from goodreads tags...")
    genre_index = load_genre_index(book_tags_path, tags_path)
    print(f"  -> genres available for {len(genre_index)} books")

    print(f"Loading goodbooks editions from {books_path}")
    goodbooks = load_goodbooks(books_path, genre_index)
    print(f"  -> {len(goodbooks)} goodbooks editions")

    print(f"Loading Book-Crossing editions from {bx_path}")
    bookcrossing = load_bookcrossing(bx_path)
    print(f"  -> {len(bookcrossing)} BX editions")

    print(f"Building catalog (cap {args.editions_per_work} editions/work)")
    rows = build_catalog(curated, goodbooks, bookcrossing,
                         editions_per_work=args.editions_per_work)
    distinct_works = len({r["unshelvd_work_id"] for r in rows})
    print(f"  -> {len(rows)} total catalog rows ({distinct_works} works)")

    multi = 0
    eds_per = defaultdict(int)
    for r in rows:
        eds_per[r["unshelvd_work_id"]] += 1
    multi = sum(1 for c in eds_per.values() if c >= 2)
    print(f"  -> {multi}/{distinct_works} works have ≥2 editions "
          f"({100 * multi / max(1, distinct_works):.1f}%)")

    print(f"Writing {OUT_CSV}")
    write_csv(rows, OUT_CSV)

    print(f"Writing {OUT_SQL}")
    write_sql(rows, OUT_SQL)

    csv_size = OUT_CSV.stat().st_size
    sql_size = OUT_SQL.stat().st_size
    print(f"\nDONE. catalog.csv = {csv_size:,} bytes; "
          f"seed-catalog.sql = {sql_size:,} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
