#!/usr/bin/env python3
"""
Bulk import works and editions from Open Library's subjects API
directly into the Unshelv'd production database.

Targets 150k+ works across English, French, German, Spanish,
Chinese, and other major languages.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import hashlib
import psycopg2
import psycopg2.extras

DB_URL = os.environ["DATABASE_URL"]
UA = "Unshelvd/1.0 (catalog-import; contact: admin@koshkikode.com)"

SUBJECTS = [
    # English-heavy subjects
    "fiction", "science_fiction", "fantasy", "mystery", "thriller",
    "romance", "horror", "adventure", "humor", "drama",
    "historical_fiction", "short_stories", "young_adult",
    "children", "classics", "poetry", "biography", "autobiography",
    "memoir", "history", "philosophy", "psychology", "science",
    "mathematics", "physics", "biology", "chemistry", "medicine",
    "economics", "politics", "sociology", "anthropology", "religion",
    "art", "music", "architecture", "photography", "cooking",
    "travel", "nature", "technology", "computers", "business",
    "self-help", "education", "law", "true_crime", "essays",
    "journalism", "graphic_novels", "comics", "manga",
    "war", "military_history", "ancient_history", "medieval_history",
    "world_war_ii", "american_history", "european_history",
    "african_history", "asian_history", "latin_american_history",
    "mythology", "folklore", "fairy_tales", "legends",
    "dystopia", "utopia", "cyberpunk", "steampunk", "space_opera",
    "epic_fantasy", "urban_fantasy", "dark_fantasy",
    "literary_fiction", "contemporary_fiction", "magical_realism",
    "satire", "allegory", "existentialism", "feminism",
    "african_literature", "japanese_literature", "chinese_literature",
    "russian_literature", "french_literature", "german_literature",
    "spanish_literature", "italian_literature", "arabic_literature",
    "indian_literature", "korean_literature", "persian_literature",
    "turkish_literature", "portuguese_literature", "polish_literature",
    "czech_literature", "hungarian_literature", "swedish_literature",
    "norwegian_literature", "danish_literature", "dutch_literature",
    "greek_literature", "latin_literature",
    "nobel_prize", "pulitzer_prize", "booker_prize", "hugo_award",
    "nebula_award", "newbery_medal", "caldecott_medal",
    "banned_books", "censorship",
    "plays", "theater", "opera", "screenwriting",
    "linguistics", "translation", "literary_criticism",
    "environmental", "climate", "ecology", "sustainability",
    "astronomy", "cosmology", "geology", "oceanography",
    "neuroscience", "genetics", "evolution",
    "entrepreneurship", "leadership", "management", "marketing",
    "investing", "personal_finance", "real_estate",
    "spirituality", "buddhism", "hinduism", "islam", "christianity",
    "judaism", "taoism", "zen", "meditation", "yoga",
]

# Language-specific queries (Open Library supports language filtering)
LANGUAGE_SUBJECTS = [
    ("fre", ["fiction", "roman", "littérature", "poésie", "philosophie", "histoire", "science", "biographie", "théâtre", "essai", "nouvelle", "conte", "aventure", "policier", "fantastique"]),
    ("ger", ["fiction", "roman", "literatur", "philosophie", "geschichte", "wissenschaft", "biographie", "lyrik", "drama", "märchen", "krimi", "fantasy"]),
    ("spa", ["fiction", "novela", "literatura", "poesía", "filosofía", "historia", "ciencia", "biografía", "teatro", "cuento", "aventura", "misterio"]),
    ("chi", ["fiction", "literature", "philosophy", "history", "poetry", "science", "biography", "novel"]),
    ("jpn", ["fiction", "literature", "manga", "novel", "poetry", "philosophy", "history"]),
    ("kor", ["fiction", "literature", "novel", "poetry", "history"]),
    ("ara", ["fiction", "literature", "poetry", "philosophy", "history", "religion"]),
    ("rus", ["fiction", "literature", "poetry", "philosophy", "history", "science"]),
    ("por", ["fiction", "literature", "poetry", "romance", "history"]),
    ("ita", ["fiction", "literature", "poetry", "philosophy", "history"]),
    ("hin", ["fiction", "literature", "poetry", "philosophy", "history"]),
    ("tur", ["fiction", "literature", "poetry", "history"]),
    ("pol", ["fiction", "literature", "poetry", "history"]),
    ("nld", ["fiction", "literature", "poetry", "history"]),
    ("swe", ["fiction", "literature", "poetry", "history"]),
    ("dan", ["fiction", "literature", "poetry"]),
    ("nor", ["fiction", "literature", "poetry"]),
    ("fin", ["fiction", "literature"]),
    ("heb", ["fiction", "literature", "poetry", "philosophy"]),
    ("vie", ["fiction", "literature"]),
    ("tha", ["fiction", "literature"]),
    ("ind", ["fiction", "literature"]),
]

LANG_CODE_TO_NAME = {
    "eng": "English", "fre": "French", "fra": "French", "ger": "German",
    "deu": "German", "spa": "Spanish", "chi": "Chinese", "zho": "Chinese",
    "jpn": "Japanese", "kor": "Korean", "ara": "Arabic", "rus": "Russian",
    "por": "Portuguese", "ita": "Italian", "hin": "Hindi", "tur": "Turkish",
    "pol": "Polish", "nld": "Dutch", "swe": "Swedish", "dan": "Danish",
    "nor": "Norwegian", "fin": "Finnish", "heb": "Hebrew", "vie": "Vietnamese",
    "tha": "Thai", "ind": "Indonesian", "ben": "Bengali", "per": "Persian",
    "fas": "Persian", "ukr": "Ukrainian", "ces": "Czech", "hun": "Hungarian",
    "ron": "Romanian", "bul": "Bulgarian", "hrv": "Croatian", "srp": "Serbian",
    "slv": "Slovenian", "cat": "Catalan", "gle": "Irish", "cym": "Welsh",
    "lat": "Latin", "grc": "Ancient Greek", "san": "Sanskrit",
    "yue": "Cantonese", "cmn": "Mandarin",
    "mul": "Multiple Languages", "und": "English",
}

SUBJECT_TO_GENRE = {
    "fiction": "Fiction", "science_fiction": "Sci-Fi", "fantasy": "Fantasy",
    "mystery": "Mystery", "thriller": "Thriller", "romance": "Romance",
    "horror": "Horror", "adventure": "Adventure", "humor": "Humor",
    "drama": "Drama", "historical_fiction": "Historical Fiction",
    "short_stories": "Short Stories", "young_adult": "Young Adult",
    "children": "Children's", "classics": "Classics", "poetry": "Poetry",
    "biography": "Biography", "autobiography": "Biography",
    "memoir": "Memoir", "history": "History", "philosophy": "Philosophy",
    "psychology": "Psychology", "science": "Science", "religion": "Religion",
    "art": "Art", "music": "Music", "cooking": "Cooking", "travel": "Travel",
    "business": "Business", "self-help": "Self-Help", "education": "Education",
    "true_crime": "True Crime", "essays": "Essays", "comics": "Graphic Novel",
    "graphic_novels": "Graphic Novel", "manga": "Manga",
    "dystopia": "Sci-Fi", "cyberpunk": "Sci-Fi", "epic_fantasy": "Fantasy",
    "magical_realism": "Fiction", "satire": "Fiction",
}


def fetch_json(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            resp = urllib.request.urlopen(req, timeout=30)
            return json.loads(resp.read())
        except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                return None


def make_unshelvd_id(prefix, title, author):
    h = hashlib.md5(f"{title}|||{author}".lower().encode()).hexdigest()[:8]
    return f"{prefix}{h.upper()}"


def get_language_name(codes):
    if not codes:
        return "English"
    if isinstance(codes, list):
        for c in codes:
            key = c.get("key", "") if isinstance(c, dict) else str(c)
            key = key.replace("/languages/", "")
            if key in LANG_CODE_TO_NAME:
                return LANG_CODE_TO_NAME[key]
        return "English"
    return "English"


def get_conn():
    return psycopg2.connect(DB_URL)


def process_subject(conn_holder, subject, genre, lang_code=None, offset=0, limit=1000):
    """Fetch works from a subject and insert them + their editions."""
    import re
    inserted_works = 0
    inserted_editions = 0

    pages = limit // 50
    for page in range(pages):
        off = offset + page * 50
        url = f"https://openlibrary.org/subjects/{subject}.json?limit=50&offset={off}"
        if lang_code:
            url += f"&language={lang_code}"

        data = fetch_json(url)
        if not data or not data.get("works"):
            break

        works = data["works"]
        if not works:
            break

        for w in works:
            title = (w.get("title") or "").strip()
            authors = w.get("authors", [])
            author = authors[0].get("name", "").strip() if authors else ""
            if not title or not author:
                continue

            ol_work_key = (w.get("key") or "").replace("/works/", "")
            cover_id = w.get("cover_id")
            cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
            first_year = w.get("first_publish_year")
            work_uid = f"OL{ol_work_key}W" if ol_work_key else make_unshelvd_id("OLW", title, author)

            try:
                conn = conn_holder[0]
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO works (unshelvd_id, title, author, genre, cover_url,
                                       first_published_year, source, verified)
                    VALUES (%s, %s, %s, %s, %s, %s, 'openlibrary', true)
                    ON CONFLICT (unshelvd_id) DO NOTHING
                    RETURNING id
                """, (work_uid, title, author, genre, cover_url, first_year))
                result = cur.fetchone()
                if result:
                    work_id = result[0]
                    inserted_works += 1
                else:
                    cur.execute("SELECT id FROM works WHERE unshelvd_id = %s", (work_uid,))
                    row = cur.fetchone()
                    work_id = row[0] if row else None
                    if not work_id:
                        conn.commit()
                        continue
                conn.commit()
            except Exception:
                try:
                    conn_holder[0].close()
                except Exception:
                    pass
                conn_holder[0] = get_conn()
                continue

            # Fetch editions for this work
            if ol_work_key:
                ed_url = f"https://openlibrary.org/works/{ol_work_key}/editions.json?limit=20"
                ed_data = fetch_json(ed_url)
                if ed_data and ed_data.get("entries"):
                    for ed in ed_data["entries"]:
                        ed_title = (ed.get("title") or title).strip()
                        isbn13_list = ed.get("isbn_13", [])
                        isbn10_list = ed.get("isbn_10", [])
                        isbn13 = isbn13_list[0] if isbn13_list else None
                        isbn10 = isbn10_list[0] if isbn10_list else None
                        publishers = ed.get("publishers", [])
                        publisher = publishers[0] if publishers else None
                        pub_date = ed.get("publish_date", "")
                        pub_year = None
                        if pub_date:
                            m = re.search(r'(\d{4})', str(pub_date))
                            if m:
                                pub_year = int(m.group(1))
                                if pub_year < 1000 or pub_year > 2030:
                                    pub_year = None
                        ed_pages = ed.get("number_of_pages")
                        lang = get_language_name(ed.get("languages"))
                        if lang_code:
                            lang = LANG_CODE_TO_NAME.get(lang_code, lang)

                        ed_cover = None
                        if isbn13:
                            ed_cover = f"https://covers.openlibrary.org/b/isbn/{isbn13}-L.jpg"
                        elif isbn10:
                            ed_cover = f"https://covers.openlibrary.org/b/isbn/{isbn10}-L.jpg"
                        elif ed.get("covers"):
                            ed_cover = f"https://covers.openlibrary.org/b/id/{ed['covers'][0]}-L.jpg"

                        ol_ed_key = (ed.get("key") or "").replace("/books/", "")
                        ed_uid = f"OL{ol_ed_key}E" if ol_ed_key else make_unshelvd_id("OLE", ed_title, author)

                        try:
                            conn = conn_holder[0]
                            cur = conn.cursor()
                            cur.execute("""
                                INSERT INTO book_catalog (unshelvd_id, title, author, isbn_10, isbn_13,
                                    language, publisher, publication_year, pages, genre, cover_url,
                                    work_id, source, verified)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'openlibrary', true)
                                ON CONFLICT (unshelvd_id) DO NOTHING
                            """, (ed_uid, ed_title, author, isbn10, isbn13,
                                  lang, publisher, pub_year, ed_pages, genre, ed_cover,
                                  work_id))
                            if cur.rowcount > 0:
                                inserted_editions += 1
                            conn.commit()
                        except Exception:
                            try:
                                conn_holder[0].close()
                            except Exception:
                                pass
                            conn_holder[0] = get_conn()
                            continue

                    time.sleep(0.1)

        time.sleep(0.5)

        if len(works) < 50:
            break

    return inserted_works, inserted_editions


def main():
    conn = get_conn()
    conn_holder = [conn]

    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM works")
    start_works = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM book_catalog")
    start_editions = cur.fetchone()[0]
    print(f"Starting counts: {start_works} works, {start_editions} editions")

    total_new_works = 0
    total_new_editions = 0

    print(f"\n{'='*60}")
    print(f"  Phase 1: English subjects ({len(SUBJECTS)} subjects)")
    print(f"{'='*60}")
    for i, subject in enumerate(SUBJECTS):
        genre = SUBJECT_TO_GENRE.get(subject, "")
        nw, ne = process_subject(conn_holder, subject, genre, limit=1000)
        total_new_works += nw
        total_new_editions += ne
        if nw > 0 or ne > 0:
            print(f"  [{i+1}/{len(SUBJECTS)}] {subject}: +{nw} works, +{ne} editions")
        else:
            print(f"  [{i+1}/{len(SUBJECTS)}] {subject}: (no new)")

        if (i + 1) % 20 == 0:
            try:
                c = conn_holder[0].cursor()
                c.execute("SELECT count(*) FROM works")
                cw = c.fetchone()[0]
                c.execute("SELECT count(*) FROM book_catalog")
                ce = c.fetchone()[0]
                print(f"  --- Progress: {cw} works, {ce} editions ---")
            except Exception:
                conn_holder[0] = get_conn()

    print(f"\n{'='*60}")
    print(f"  Phase 2: Language-specific subjects")
    print(f"{'='*60}")
    for lang_code, lang_subjects in LANGUAGE_SUBJECTS:
        lang_name = LANG_CODE_TO_NAME.get(lang_code, lang_code)
        print(f"\n  {lang_name} ({lang_code}):")
        for subject in lang_subjects:
            genre = SUBJECT_TO_GENRE.get(subject, "")
            nw, ne = process_subject(conn_holder, subject, genre, lang_code=lang_code, limit=500)
            total_new_works += nw
            total_new_editions += ne
            if nw > 0 or ne > 0:
                print(f"    {subject}: +{nw} works, +{ne} editions")

    print("\nUpdating edition counts...")
    try:
        conn = conn_holder[0]
        cur = conn.cursor()
        cur.execute("""
            UPDATE works w SET edition_count = sub.cnt
            FROM (
                SELECT work_id, COUNT(*) AS cnt FROM book_catalog
                WHERE work_id IS NOT NULL GROUP BY work_id
            ) sub
            WHERE w.id = sub.work_id
        """)
        conn.commit()
    except Exception:
        conn_holder[0] = get_conn()

    conn = conn_holder[0]
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM works")
    final_works = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM book_catalog")
    final_editions = cur.fetchone()[0]
    cur.execute("SELECT language, count(*) FROM book_catalog GROUP BY language ORDER BY count(*) DESC LIMIT 20")
    langs = cur.fetchall()

    print(f"\n{'='*60}")
    print(f"  DONE!")
    print(f"  Works: {start_works} -> {final_works} (+{final_works - start_works})")
    print(f"  Editions: {start_editions} -> {final_editions} (+{final_editions - start_editions})")
    print(f"\n  Top languages:")
    for lang, count in langs:
        print(f"    {lang}: {count}")
    print(f"{'='*60}")

    conn.close()


if __name__ == "__main__":
    main()
