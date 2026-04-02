#!/usr/bin/env python3
"""Fast catalog seeder using urllib (not aiohttp) to avoid OL blocking."""
import urllib.request
import json
import time
import psycopg2
import os

DB_URL = os.environ.get("DATABASE_URL", "postgresql://unshelvd:unshelvd_dev@localhost:5432/unshelvd")

LANG_MAP = {
    "eng": "English", "spa": "Spanish", "fre": "French", "ger": "German",
    "por": "Portuguese", "ita": "Italian", "rus": "Russian", "chi": "Chinese",
    "jpn": "Japanese", "kor": "Korean", "ara": "Arabic", "hin": "Hindi",
    "ben": "Bengali", "urd": "Urdu", "tur": "Turkish", "per": "Persian",
    "pol": "Polish", "cze": "Czech", "dut": "Dutch", "swe": "Swedish",
    "nor": "Norwegian", "dan": "Danish", "fin": "Finnish", "gre": "Greek",
    "rom": "Romanian", "hun": "Hungarian", "srp": "Serbian", "hrv": "Croatian",
    "heb": "Hebrew", "lat": "Latin", "tha": "Thai", "vie": "Vietnamese",
    "swa": "Swahili", "geo": "Georgian", "arm": "Armenian",
}

QUERIES = [
    "tolkien", "shakespeare", "dickens", "dostoevsky", "tolstoy",
    "kafka", "hemingway", "orwell", "austen", "hugo",
    "garcia marquez", "borges", "camus", "proust", "cervantes",
    "murakami", "mishima", "goethe", "dante", "homer",
    "chekhov", "nabokov", "faulkner", "twain", "woolf",
    "bulgakov", "hesse", "neruda", "tagore", "achebe",
    "rushdie", "calvino", "eco", "saramago", "kundera",
    "solzhenitsyn", "pasternak", "pushkin", "balzac", "flaubert",
    "zola", "baudelaire", "rilke", "mann", "nietzsche",
    "gibran", "rumi", "mahfouz", "pamuk", "coetzee",
    "morrison", "pynchon", "vonnegut", "bradbury", "asimov",
    "clarke", "ursula le guin", "philip dick", "lovecraft",
    "christie agatha", "tolkien hobbit", "rowling harry potter",
    "orwell 1984", "fitzgerald gatsby", "salinger catcher",
    "huxley brave new world", "atwood handmaid", "dune herbert",
    "foundation asimov", "neuromancer gibson", "ender game card",
    "world literature", "penguin classics", "nobel literature",
    "russian literature", "french literature", "japanese literature",
    "chinese literature", "arabic literature", "african literature",
    "korean literature", "persian poetry", "serbian literature",
    "yugoslav literature", "science fiction", "fantasy classic",
    "philosophy classic", "poetry classic", "history ancient",
    "religious texts", "buddhist texts", "quran", "bible",
    "mahabharata", "ramayana", "iliad odyssey", "divine comedy",
    "war and peace", "crime punishment", "brothers karamazov",
    "anna karenina", "don quixote", "les miserables",
    "tale two cities", "pride prejudice", "wuthering heights",
    "jane eyre", "great expectations", "moby dick",
    "one hundred years solitude", "love time cholera",
    "infinite jest", "gravity rainbow", "blood meridian",
    "beloved morrison", "invisible man ellison",
    "things fall apart", "master margarita",
    "stranger camus", "trial kafka", "metamorphosis",
    "siddhartha hesse", "steppenwolf", "glass bead game",
    "name of the rose", "if on a winter night",
    "blindness saramago", "book disquiet pessoa",
    "dream red chamber", "journey to the west",
    "tale of genji", "snow country kawabata",
    "wind up bird chronicle", "norwegian wood murakami",
    "thousand splendid suns", "kite runner",
    "graphic novel maus", "persepolis", "sandman gaiman",
    "manga akira", "manga one piece", "manga naruto",
    "children literature classic", "picture book award",
    "banned books", "first edition collectible",
]

def fetch_query(query):
    """Fetch books from Open Library for a query."""
    try:
        fields = "title,author_name,first_publish_year,publisher,isbn,cover_i,subject,language,key"
        url = f"https://openlibrary.org/search.json?q={urllib.parse.quote(query)}&limit=100&fields={fields}"
        req = urllib.request.Request(url, headers={"User-Agent": "Unshelvd/1.0 (book marketplace catalog)"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get("docs", [])
    except Exception as e:
        return []

def main():
    print(f"\n{'='*50}")
    print(f"  Unshelv'd — Catalog Seeder")
    print(f"  {len(QUERIES)} queries × 100 results max")
    print(f"{'='*50}\n")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    total_fetched = 0
    total_inserted = 0
    seen_keys = set()

    for i, query in enumerate(QUERIES):
        docs = fetch_query(query)
        batch = []

        for doc in docs:
            if not doc.get("title") or not doc.get("author_name"):
                continue
            key = doc.get("key")
            if key and key in seen_keys:
                continue
            seen_keys.add(key)

            lang3 = (doc.get("language") or [None])[0]
            isbn_list = doc.get("isbn") or []
            cover_id = doc.get("cover_i")

            batch.append((
                doc["title"][:500],
                doc["author_name"][0][:200],
                next((x for x in isbn_list if len(x) == 13), None),
                next((x for x in isbn_list if len(x) == 10), None),
                key,
                (doc.get("publisher") or [None])[0],
                doc.get("first_publish_year"),
                LANG_MAP.get(lang3, lang3 or "English"),
                f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None,
                ",".join((doc.get("subject") or [])[:10])[:500] or None,
                "open_library",
                key,
            ))

        if batch:
            try:
                args = ",".join(
                    cur.mogrify("(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", r).decode()
                    for r in batch
                )
                cur.execute(f"""
                    INSERT INTO book_catalog (title, author, isbn_13, isbn_10, open_library_id,
                        publisher, first_published_year, language, cover_url, subjects, source, source_id)
                    VALUES {args}
                    ON CONFLICT DO NOTHING
                """)
                inserted = cur.rowcount
                total_inserted += inserted
                conn.commit()
            except Exception as e:
                conn.rollback()
                inserted = 0

            total_fetched += len(batch)
            print(f"  [{i+1}/{len(QUERIES)}] \"{query}\" → {len(batch)} fetched, {inserted} new  (total: {total_inserted:,})")
        else:
            print(f"  [{i+1}/{len(QUERIES)}] \"{query}\" → 0")

        time.sleep(0.5)

    # Stats
    cur.execute("SELECT count(*) FROM book_catalog")
    total_db = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM book_catalog WHERE cover_url IS NOT NULL")
    covers = cur.fetchone()[0]
    cur.execute("SELECT language, count(*) FROM book_catalog GROUP BY language ORDER BY count(*) DESC LIMIT 20")
    langs = cur.fetchall()

    conn.close()

    print(f"\n{'='*50}")
    print(f"  DONE!")
    print(f"  Catalog total: {total_db:,} entries")
    print(f"  With covers: {covers:,}")
    print(f"  New this run: {total_inserted:,}")
    print(f"\n  Languages:")
    for lang, cnt in langs:
        print(f"    {lang}: {cnt:,}")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    import urllib.parse
    main()
