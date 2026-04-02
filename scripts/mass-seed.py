#!/usr/bin/env python3
"""
Mass catalog seeder — fetches thousands of books from Open Library in parallel.
Much faster than the Node version due to async HTTP.
"""
import asyncio
import aiohttp
import json
import os
import sys

DB_URL = os.environ.get("DATABASE_URL", "postgresql://unshelvd:unshelvd_dev@localhost:5432/unshelvd")

LANG_MAP = {
    "eng": "English", "spa": "Spanish", "fre": "French", "ger": "German",
    "por": "Portuguese", "ita": "Italian", "rus": "Russian", "chi": "Chinese",
    "jpn": "Japanese", "kor": "Korean", "ara": "Arabic", "hin": "Hindi",
    "ben": "Bengali", "urd": "Urdu", "tur": "Turkish", "per": "Persian",
    "pol": "Polish", "cze": "Czech", "dut": "Dutch", "swe": "Swedish",
    "nor": "Norwegian", "dan": "Danish", "fin": "Finnish", "gre": "Greek",
    "rom": "Romanian", "hun": "Hungarian", "srp": "Serbian", "hrv": "Croatian",
    "bos": "Bosnian", "slv": "Slovenian", "bul": "Bulgarian", "ukr": "Ukrainian",
    "heb": "Hebrew", "yid": "Yiddish", "lat": "Latin", "san": "Sanskrit",
    "tam": "Tamil", "tha": "Thai", "vie": "Vietnamese", "ind": "Indonesian",
    "swa": "Swahili", "amh": "Amharic", "geo": "Georgian", "arm": "Armenian",
    "kaz": "Kazakh", "uzb": "Uzbek", "alb": "Albanian", "mac": "Macedonian",
}

QUERIES = [
    # World classics
    "nobel prize literature", "world literature classics", "penguin classics",
    "modern library best novels", "everyman library",
    # English
    "shakespeare", "dickens", "jane austen", "mark twain", "virginia woolf",
    "george orwell", "hemingway", "fitzgerald gatsby", "toni morrison",
    "faulkner", "melville moby dick", "poe raven", "vonnegut",
    "mccarthy blood meridian", "pynchon gravity rainbow", "salman rushdie",
    # Russian
    "tolstoy", "dostoevsky", "chekhov", "pushkin", "gogol", "bulgakov",
    "solzhenitsyn", "nabokov", "pasternak", "akhmatova", "strugatsky",
    # French
    "victor hugo", "proust", "camus", "sartre", "flaubert", "baudelaire",
    "voltaire", "dumas", "zola", "balzac", "moliere",
    # German
    "goethe", "kafka", "thomas mann", "hesse", "rilke", "brecht", "nietzsche",
    "gunter grass", "heinrich boll",
    # Spanish
    "cervantes", "garcia marquez", "borges", "neruda", "allende",
    "cortazar", "vargas llosa", "bolano", "octavio paz",
    # Portuguese
    "pessoa", "saramago", "machado assis", "clarice lispector",
    # Italian
    "dante", "boccaccio", "eco name rose", "calvino", "primo levi",
    # Japanese
    "murakami haruki", "mishima", "kawabata", "tanizaki", "soseki natsume",
    "tale genji murasaki", "kenzaburo oe", "banana yoshimoto",
    # Chinese
    "dream red chamber", "three kingdoms", "journey west", "water margin",
    "lu xun", "mo yan", "yu hua", "confucius analects", "tao te ching",
    # Korean
    "han kang vegetarian", "korean literature", "korean fiction",
    # Arabic/Persian
    "thousand one nights", "naguib mahfouz", "khalil gibran", "rumi poetry",
    "hafez divan", "omar khayyam", "ibn khaldun", "shahnameh",
    "arabic literature", "persian poetry",
    # Turkish
    "orhan pamuk", "elif shafak", "yashar kemal", "nazim hikmet",
    # South Asian
    "tagore", "arundhati roy", "vikram seth", "mahabharata", "ramayana",
    "bhagavad gita", "upanishads", "hindi literature",
    # African
    "chinua achebe", "ngugi thiongo", "chimamanda adichie", "wole soyinka",
    "coetzee disgrace", "african literature",
    # Yugoslav/Balkan
    "ivo andric", "mesa selimovic", "danilo kis", "miroslav krleza",
    "serbian literature", "yugoslav literature",
    # Soviet/Eastern European
    "kundera", "hasek svejk", "lem solaris", "polish literature",
    "hungarian literature", "romanian literature",
    # Central Asian
    "kazakh literature abai", "aitmatov", "uzbek literature",
    # Nordic
    "ibsen", "hamsun hunger", "halldor laxness", "nordic literature",
    # Genres
    "science fiction classic", "fantasy tolkien", "horror lovecraft",
    "mystery agatha christie", "philosophy plato aristotle",
    "poetry anthology", "biography memoir",
    # Religious
    "bible translations", "quran", "torah talmud", "buddhist sutras",
    "hindu scriptures", "sufi literature",
    # Rare
    "first edition rare", "antique books", "banned books",
    "illuminated manuscripts",
    # Modern
    "graphic novel award", "manga bestselling", "children classic",
]

async def fetch_query(session, query, semaphore):
    """Fetch one query from Open Library."""
    async with semaphore:
        try:
            fields = "title,author_name,first_publish_year,publisher,isbn,cover_i,subject,language,key"
            url = f"https://openlibrary.org/search.json?q={query}&limit=100&fields={fields}"
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                if resp.status != 200:
                    return query, []
                data = await resp.json()
                docs = data.get("docs", [])
                results = []
                for doc in docs:
                    if not doc.get("title") or not doc.get("author_name"):
                        continue
                    lang3 = (doc.get("language") or [None])[0]
                    isbn_list = doc.get("isbn") or []
                    cover_id = doc.get("cover_i")
                    results.append((
                        doc["title"][:500],
                        doc["author_name"][0][:200],
                        next((i for i in isbn_list if len(i) == 13), None),
                        next((i for i in isbn_list if len(i) == 10), None),
                        doc.get("key"),
                        (doc.get("publisher") or [None])[0],
                        doc.get("first_publish_year"),
                        LANG_MAP.get(lang3, lang3 or "English"),
                        f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None,
                        ",".join((doc.get("subject") or [])[:10])[:500] or None,
                        "open_library",
                        doc.get("key"),
                    ))
                return query, results
        except Exception as e:
            return query, []

async def main():
    print(f"\n{'='*50}")
    print(f"  Unshelv'd — Mass Catalog Seeder")
    print(f"  {len(QUERIES)} queries × 100 results = up to {len(QUERIES)*100:,} books")
    print(f"{'='*50}\n")
    
    # Fetch all queries with concurrency limit
    semaphore = asyncio.Semaphore(5)  # 5 concurrent requests
    all_rows = []
    
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_query(session, q, semaphore) for q in QUERIES]
        for i, coro in enumerate(asyncio.as_completed(tasks)):
            query, results = await coro
            all_rows.extend(results)
            if results:
                print(f"  [{i+1}/{len(QUERIES)}] \"{query}\" → {len(results)} books")
            else:
                print(f"  [{i+1}/{len(QUERIES)}] \"{query}\" → skipped")
    
    print(f"\n  Fetched {len(all_rows):,} total entries. Inserting into database...")
    
    # Bulk insert via psql COPY
    import subprocess
    import csv
    import io
    
    # Write to CSV
    csv_path = "/tmp/catalog_import.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "title", "author", "isbn_13", "isbn_10", "open_library_id",
            "publisher", "first_published_year", "language", "cover_url",
            "subjects", "source", "source_id"
        ])
        seen = set()
        for row in all_rows:
            # Deduplicate by open_library_id
            key = row[4]  # open_library_id
            if key and key in seen:
                continue
            seen.add(key)
            writer.writerow(row)
    
    deduped = len(seen)
    print(f"  Deduplicated to {deduped:,} unique entries.")
    
    # Insert via psql
    sql = f"""
    CREATE TEMP TABLE catalog_staging (
        title text, author text, isbn_13 text, isbn_10 text, open_library_id text,
        publisher text, first_published_year text, language text, cover_url text,
        subjects text, source text, source_id text
    );
    \\copy catalog_staging FROM '{csv_path}' CSV HEADER;
    INSERT INTO book_catalog (title, author, isbn_13, isbn_10, open_library_id,
        publisher, first_published_year, language, cover_url, subjects, source, source_id)
    SELECT title, author, isbn_13, isbn_10, open_library_id,
        publisher, NULLIF(first_published_year, '')::int, language, cover_url, subjects, source, source_id
    FROM catalog_staging
    ON CONFLICT DO NOTHING;
    SELECT count(*) as total FROM book_catalog;
    """
    
    result = subprocess.run(
        ["psql", DB_URL, "-c", sql.replace("\\copy", "\\copy")],
        capture_output=True, text=True
    )
    
    # Simpler approach: use individual INSERT
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    inserted = 0
    batch = []
    for row in all_rows:
        key = row[4]
        batch.append(row)
        if len(batch) >= 200:
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
                inserted += cur.rowcount
                conn.commit()
            except Exception as e:
                conn.rollback()
            batch = []
    
    # Final batch
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
            inserted += cur.rowcount
            conn.commit()
        except:
            conn.rollback()
    
    cur.execute("SELECT count(*) FROM book_catalog")
    total = cur.fetchone()[0]
    
    cur.execute("SELECT count(*) FROM book_catalog WHERE cover_url IS NOT NULL")
    covers = cur.fetchone()[0]
    
    cur.execute("SELECT language, count(*) as cnt FROM book_catalog GROUP BY language ORDER BY cnt DESC LIMIT 15")
    langs = cur.fetchall()
    
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"  DONE! Catalog: {total:,} entries ({inserted:,} new)")
    print(f"  Books with covers: {covers:,}")
    print(f"\n  Top languages:")
    for lang, cnt in langs:
        print(f"    {lang}: {cnt:,}")
    print(f"{'='*50}\n")

if __name__ == "__main__":
    asyncio.run(main())
