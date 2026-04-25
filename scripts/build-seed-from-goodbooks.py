#!/usr/bin/env python3
"""
Regenerate database/catalog.csv and database/seed-catalog.sql from the
public goodbooks-10k dataset (https://github.com/zygmuntz/goodbooks-10k,
CC BY-SA 4.0). Factual fields (titles, authors, ISBNs, publication years)
are not themselves copyrightable; the compilation is attributed in
database/README.md.

The generator is idempotent: it preserves the manually curated rows
already present in database/catalog.csv (international classics not
covered by goodbooks-10k) and merges them with the 10,000 popular works
from the dataset, deduplicating on (work_title, work_author) for works
and on isbn13 for catalog editions.

Usage:
    python3 scripts/build-seed-from-goodbooks.py
        [--books /tmp/seed/books.csv]
        [--book-tags /tmp/seed/book_tags.csv]
        [--tags /tmp/seed/tags.csv]
        [--cache-dir /tmp/seed]

If the source CSVs are not present in --cache-dir, they will be
downloaded from raw.githubusercontent.com.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parent.parent
EXISTING_CSV = REPO_ROOT / "database" / "catalog.csv"
OUT_CSV = REPO_ROOT / "database" / "catalog.csv"
OUT_SQL = REPO_ROOT / "database" / "seed-catalog.sql"

GOODBOOKS_BASE = (
    "https://raw.githubusercontent.com/zygmuntz/goodbooks-10k/master"
)
SOURCES = {
    "books.csv": f"{GOODBOOKS_BASE}/books.csv",
    "book_tags.csv": f"{GOODBOOKS_BASE}/book_tags.csv",
    "tags.csv": f"{GOODBOOKS_BASE}/tags.csv",
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
    "work_title", "work_author", "title", "author",
    "isbn13", "isbn10", "language", "publisher",
    "publication_year", "genre", "cover_url",
    "original_language", "country_of_origin",
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
    """Read the existing curated CSV rows so we never lose them."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


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


def clean_title(raw: str) -> str:
    """Strip series suffixes like ' (The Hunger Games, #1)' for the
    canonical work title; the full edition title is kept separately."""
    raw = (raw or "").strip()
    cut = raw.rfind(" (")
    if cut > 0 and raw.endswith(")"):
        return raw[:cut].strip()
    return raw


def primary_author(raw: str) -> str:
    """goodbooks lists co-authors comma-separated; use the first as the
    canonical author (matches goodreads work convention)."""
    if not raw:
        return ""
    return raw.split(",")[0].strip()


def cover_for(isbn13: Optional[str], image_url: Optional[str]) -> Optional[str]:
    """Prefer the stable Open Library cover URL when an ISBN-13 is known
    (Goodreads CDN URLs in the dataset have rotted historically)."""
    if isbn13:
        return f"https://covers.openlibrary.org/b/isbn/{isbn13}-L.jpg"
    if image_url and "nophoto" not in image_url:
        return image_url
    return None


def build_rows(
    books_path: Path,
    genre_index: Dict[str, str],
    curated: List[Dict[str, str]],
) -> List[Dict[str, str]]:
    """Merge curated rows with goodbooks-10k rows. Curated rows win on
    duplicates (matched by isbn13, falling back to (title, author))."""

    rows: List[Dict[str, str]] = []
    seen_isbn13: set = set()
    seen_title_author: set = set()
    seen_work: set = set()

    # 1) Preserve every curated row exactly as-is (they are hand-verified
    #    and include international classics not in goodbooks-10k).
    for row in curated:
        normalized = {field: (row.get(field) or "").strip() for field in CSV_FIELDS}
        rows.append(normalized)
        if normalized["isbn13"]:
            seen_isbn13.add(normalized["isbn13"])
        seen_title_author.add((normalized["title"], normalized["author"]))
        seen_work.add((normalized["work_title"], normalized["work_author"]))

    # 2) Append goodbooks rows that don't collide with curated.
    with open(books_path, encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            isbn10 = pad_isbn10(raw.get("isbn") or "")
            isbn13 = normalize_isbn13(raw.get("isbn13") or "", isbn10)
            if isbn13 and isbn13 in seen_isbn13:
                continue
            edition_title = (raw.get("title") or "").strip()
            if not edition_title:
                continue
            author = primary_author(raw.get("authors") or "")
            if not author:
                continue
            # Fallback dedup when ISBN-13 is unknown so re-running the
            # generator stays idempotent.
            if not isbn13 and (edition_title, author) in seen_title_author:
                continue
            work_title = clean_title(
                (raw.get("original_title") or "").strip() or edition_title
            )
            work_author = author
            work_key = (work_title, work_author)
            language = map_language(raw.get("language_code") or "")
            year = parse_year(raw.get("original_publication_year") or "")
            genre = genre_index.get(raw.get("goodreads_book_id") or "", "")
            cover = cover_for(isbn13, raw.get("image_url"))

            rows.append({
                "work_title": work_title,
                "work_author": work_author,
                "title": edition_title,
                "author": author,
                "isbn13": isbn13 or "",
                "isbn10": isbn10 or "",
                "language": language,
                "publisher": "",
                "publication_year": str(year) if year is not None else "",
                "genre": genre,
                "cover_url": cover or "",
                "original_language": "",
                "country_of_origin": "",
            })
            if isbn13:
                seen_isbn13.add(isbn13)
            seen_title_author.add((edition_title, author))
            seen_work.add(work_key)

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


def write_sql(rows: List[Dict[str, str]], path: Path, batch_size: int = 250) -> None:
    """Emit batched multi-row INSERTs for efficiency. Idempotent via
    a defensive WHERE NOT EXISTS check below (we leave open_library_id
    NULL, so the schema's open_library_id unique constraint won't help
    against duplicates)."""

    # Index hand-curated work metadata by (title, author) so we can
    # overlay accurate first_published_year / original_language values
    # onto rows that came from the goodbooks edition CSV.
    curated_index: Dict[Tuple[str, str], Tuple[Optional[str], Optional[int], Optional[str], Optional[str]]] = {
        (title, author): (orig_lang, year, genre, cover)
        for title, author, orig_lang, year, genre, cover in CURATED_WORKS
    }

    # Deduplicate works by (work_title, work_author).
    works_seen: set = set()
    works_data: List[Tuple[str, str, Optional[str], Optional[str], Optional[str], Optional[str]]] = []
    for row in rows:
        key = (row["work_title"], row["work_author"])
        if not row["work_title"] or not row["work_author"]:
            continue
        if key in works_seen:
            continue
        works_seen.add(key)
        curated = curated_index.get(key)
        if curated is not None:
            orig_lang, year, genre, cover = curated
            works_data.append((
                row["work_title"],
                row["work_author"],
                orig_lang,
                str(year) if year is not None else None,
                genre,
                cover,
            ))
        else:
            works_data.append((
                row["work_title"],
                row["work_author"],
                row.get("original_language") or row.get("language") or None,
                row.get("publication_year") or None,
                row.get("genre") or None,
                row.get("cover_url") or None,
            ))

    with open(path, "w", encoding="utf-8") as f:
        f.write(
            "-- ============================================================\n"
            "-- Unshelv'd -- Comprehensive Catalog Seed Data\n"
            "-- PostgreSQL (Amazon RDS / standard PostgreSQL 13+)\n"
            "--\n"
            "-- AUTOGENERATED by scripts/build-seed-from-goodbooks.py from:\n"
            "--   * the manually curated rows in database/catalog.csv\n"
            "--   * the goodbooks-10k dataset\n"
            "--     (https://github.com/zygmuntz/goodbooks-10k, CC BY-SA 4.0)\n"
            "--\n"
            "-- Inserts works first, then book_catalog editions linked to them\n"
            "-- by (title, author). Safe to re-run.\n"
            "--\n"
            "-- Usage (psql):\n"
            "--   psql \"$DATABASE_URL\" -f database/seed-catalog.sql\n"
            "-- ============================================================\n\n"
        )

        # ── Works ───────────────────────────────────────────────────
        f.write(
            "-- Works (one row per abstract literary work)\n"
            "-- Idempotent via WHERE NOT EXISTS — the works table has no\n"
            "-- unique index on (title, author) so we can't rely on\n"
            "-- ON CONFLICT for dedup.\n"
        )
        for i in range(0, len(works_data), batch_size):
            chunk = works_data[i:i + batch_size]
            f.write(
                "WITH new_works (title, author, original_language, "
                "first_published_year, genre, cover_url) AS (VALUES\n"
            )
            values: List[str] = []
            for title, author, orig_lang, year, genre, cover in chunk:
                values.append(
                    "  ("
                    + sql_quote(title) + ", "
                    + sql_quote(author) + ", "
                    + sql_quote(orig_lang) + ", "
                    + (sql_int(year) if year else "NULL") + "::int, "
                    + sql_quote(genre) + ", "
                    + sql_quote(cover) + ")"
                )
            f.write(",\n".join(values))
            f.write(
                "\n)\n"
                "INSERT INTO works (title, author, original_language, "
                "first_published_year, genre, cover_url, source, verified)\n"
                "SELECT n.title, n.author, n.original_language, "
                "n.first_published_year, n.genre, n.cover_url, "
                "'manual', true\n"
                "FROM new_works n\n"
                "WHERE NOT EXISTS (\n"
                "  SELECT 1 FROM works w\n"
                "  WHERE w.title = n.title AND w.author = n.author\n"
                ");\n\n"
            )

        # ── Book catalog editions ──────────────────────────────────
        f.write(
            "-- Book catalog editions (one or more per work, linked back\n"
            "-- to the works table via a correlated subquery on title+author)\n"
        )
        for i in range(0, len(rows), batch_size):
            chunk = rows[i:i + batch_size]
            # Use a CTE so we can join each edition row to its work_id in a
            # single statement instead of doing 10k individual lookups.
            f.write("WITH edition_data (title, author, isbn_10, isbn_13, language, "
                    "publisher, publication_year, genre, cover_url, original_language, "
                    "country_of_origin, work_title, work_author) AS (VALUES\n")
            values = []
            for row in chunk:
                year = sql_int(row.get("publication_year"))
                values.append(
                    "  ("
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
                    + sql_quote(row["country_of_origin"] or None) + ", "
                    + sql_quote(row["work_title"] or None) + ", "
                    + sql_quote(row["work_author"] or None) + ")"
                )
            f.write(",\n".join(values))
            f.write(
                "\n)\n"
                "INSERT INTO book_catalog (title, author, isbn_10, isbn_13, language, "
                "publisher, publication_year, genre, cover_url, original_language, "
                "country_of_origin, work_id, source, verified)\n"
                "SELECT e.title, e.author, e.isbn_10, e.isbn_13, e.language, "
                "e.publisher, e.publication_year, e.genre, e.cover_url, "
                "e.original_language, e.country_of_origin,\n"
                "  (SELECT w.id FROM works w "
                "WHERE w.title = e.work_title AND w.author = e.work_author LIMIT 1),\n"
                "  'manual', true\n"
                "FROM edition_data e\n"
                "WHERE NOT EXISTS (\n"
                "  SELECT 1 FROM book_catalog b\n"
                "  WHERE (b.isbn_13 IS NOT NULL AND b.isbn_13 = e.isbn_13)\n"
                "     OR (b.isbn_13 IS NULL AND e.isbn_13 IS NULL\n"
                "         AND b.title = e.title AND b.author = e.author)\n"
                ");\n\n"
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
    parser.add_argument("--books", help="override path to books.csv")
    parser.add_argument("--book-tags", help="override path to book_tags.csv")
    parser.add_argument("--tags", help="override path to tags.csv")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    download_if_missing(cache_dir)

    books_path = Path(args.books) if args.books else cache_dir / "books.csv"
    book_tags_path = Path(args.book_tags) if args.book_tags else cache_dir / "book_tags.csv"
    tags_path = Path(args.tags) if args.tags else cache_dir / "tags.csv"

    print(f"Loading curated rows from {EXISTING_CSV}")
    curated = load_curated_rows(EXISTING_CSV)
    print(f"  -> {len(curated)} curated rows preserved")

    print("Loading genre index from goodreads tags...")
    genre_index = load_genre_index(book_tags_path, tags_path)
    print(f"  -> genres available for {len(genre_index)} books")

    print(f"Building merged rows from {books_path}")
    rows = build_rows(books_path, genre_index, curated)
    print(f"  -> {len(rows)} total catalog rows")

    distinct_works = len({(r["work_title"], r["work_author"]) for r in rows
                          if r["work_title"] and r["work_author"]})
    print(f"  -> {distinct_works} distinct works")

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
