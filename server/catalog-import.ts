/**
 * Unshelv'd — Book Catalog Importer
 * 
 * Seeds the proprietary book_catalog table from Open Library's bulk data.
 * 
 * Open Library provides monthly data dumps at:
 *   https://openlibrary.org/developers/dumps
 * 
 * Files:
 *   - ol_dump_works_latest.txt.gz (~2.5 GB, ~30M works)
 *   - ol_dump_editions_latest.txt.gz (~5 GB, ~40M editions)
 *   - ol_dump_authors_latest.txt.gz (~500 MB, ~12M authors)
 * 
 * This script processes the editions dump and imports into PostgreSQL.
 * 
 * Usage:
 *   # Download the dump first:
 *   wget https://openlibrary.org/data/ol_dump_editions_latest.txt.gz
 *   
 *   # Import (processes in streaming batches):
 *   DATABASE_URL=... npx tsx server/catalog-import.ts ol_dump_editions_latest.txt.gz
 * 
 * The script streams the gzipped file line by line, parses each JSON record,
 * and batch-inserts into the book_catalog table.
 * 
 * For a faster initial seed, we also support importing from the Open Library
 * Search API which gives us curated, higher-quality records.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { bookCatalog } from "@shared/schema";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { createGunzip } from "zlib";

const BATCH_SIZE = 500;

// Map Open Library language codes to readable names
const langMap: Record<string, string> = {
  eng: "English", spa: "Spanish", fre: "French", ger: "German",
  por: "Portuguese", ita: "Italian", rus: "Russian", chi: "Chinese",
  jpn: "Japanese", kor: "Korean", ara: "Arabic", hin: "Hindi",
  ben: "Bengali", urd: "Urdu", tur: "Turkish", per: "Persian",
  pol: "Polish", cze: "Czech", dut: "Dutch", swe: "Swedish",
  nor: "Norwegian", dan: "Danish", fin: "Finnish", gre: "Greek",
  rom: "Romanian", hun: "Hungarian", srp: "Serbian", hrv: "Croatian",
  bos: "Bosnian", slv: "Slovenian", bul: "Bulgarian", ukr: "Ukrainian",
  heb: "Hebrew", yid: "Yiddish", lat: "Latin", san: "Sanskrit",
  tam: "Tamil", tel: "Telugu", mal: "Malayalam", mar: "Marathi",
  tha: "Thai", vie: "Vietnamese", ind: "Indonesian", may: "Malay",
  swa: "Swahili", amh: "Amharic", geo: "Georgian", arm: "Armenian",
  cat: "Catalan", glg: "Galician", baq: "Basque", ice: "Icelandic",
  gle: "Irish", wel: "Welsh", tib: "Tibetan", mon: "Mongolian",
  alb: "Albanian", mac: "Macedonian", mul: "Multiple Languages",
  und: "Unknown",
};

function detectTextDirection(lang: string): "ltr" | "rtl" {
  const rtlLangs = ["ara", "heb", "per", "urd", "yid", "fas", "pus", "syr"];
  return rtlLangs.includes(lang) ? "rtl" : "ltr";
}

function detectScript(lang: string): string | null {
  const scriptMap: Record<string, string> = {
    ara: "Arabic (العربية)", heb: "Hebrew (עברית)", per: "Persian (فارسی)",
    urd: "Devanagari", hin: "Devanagari (देवनागरी)", ben: "Bengali (বাংলা)",
    tam: "Tamil (தமிழ்)", tel: "Telugu (తెలుగు)", mal: "Malayalam (മലയാളം)",
    mar: "Devanagari (देवनागरी)", tha: "Thai (ไทย)",
    jpn: "Japanese (Kanji 漢字)", kor: "Korean (Hangul 한글)",
    chi: "Chinese (Simplified 简体)", rus: "Cyrillic", ukr: "Cyrillic",
    srp: "Cyrillic", bul: "Cyrillic", bel: "Cyrillic", mac: "Cyrillic",
    geo: "Georgian (ქართული)", arm: "Armenian (Հայերեն)",
    tib: "Tibetan (བོད་ཡིག)", mon: "Mongolian (ᠮᠣᠩᠭᠣᠯ)",
    gre: "Greek",
  };
  return scriptMap[lang] || null;
}

async function importFromDump(filePath: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log(`Importing from ${filePath}...`);

  const fileStream = createReadStream(filePath);
  const gunzip = filePath.endsWith(".gz") ? createGunzip() : undefined;
  const input = gunzip ? fileStream.pipe(gunzip) : fileStream;

  const rl = createInterface({ input, crlfDelay: Infinity });

  let batch: any[] = [];
  let count = 0;
  let errors = 0;

  for await (const line of rl) {
    try {
      // Open Library dump format: TYPE\tKEY\tREVISION\tLAST_MODIFIED\tJSON
      const parts = line.split("\t");
      if (parts.length < 5) continue;

      const json = JSON.parse(parts[4]);
      if (!json.title) continue;

      const lang3 = json.languages?.[0]?.key?.replace("/languages/", "") || "und";
      const language = langMap[lang3] || lang3;

      const entry = {
        title: json.title,
        titleNative: null as string | null,
        author: json.by_statement || json.contributions?.[0] || "Unknown",
        isbn13: json.isbn_13?.[0] || null,
        isbn10: json.isbn_10?.[0] || null,
        openLibraryId: parts[1],
        publisher: json.publishers?.[0] || null,
        publicationYear: json.publish_date ? parseInt(json.publish_date) || null : null,
        pages: json.number_of_pages || null,
        language,
        script: detectScript(lang3),
        textDirection: detectTextDirection(lang3),
        countryOfOrigin: json.publish_country || null,
        genre: json.subjects?.slice(0, 5).join(",") || null,
        subjects: json.subjects?.join(",") || null,
        deweyDecimal: json.dewey_decimal_class?.[0] || null,
        lcClassification: json.lc_classifications?.[0] || null,
        coverUrl: json.covers?.[0]
          ? `https://covers.openlibrary.org/b/id/${json.covers[0]}-L.jpg`
          : null,
        description: typeof json.description === "string"
          ? json.description.substring(0, 1000)
          : json.description?.value?.substring(0, 1000) || null,
        source: "open_library",
        sourceId: parts[1],
      };

      batch.push(entry);

      if (batch.length >= BATCH_SIZE) {
        await db.insert(bookCatalog).values(batch).onConflictDoNothing({ target: bookCatalog.openLibraryId });
        count += batch.length;
        batch = [];
        if (count % 10000 === 0) {
          console.log(`  Imported ${count.toLocaleString()} entries (${errors} errors)...`);
        }
      }
    } catch (e) {
      errors++;
    }
  }

  // Insert remaining
  if (batch.length > 0) {
    await db.insert(bookCatalog).values(batch).onConflictDoNothing({ target: bookCatalog.openLibraryId });
    count += batch.length;
  }

  console.log(`\nDone! Imported ${count.toLocaleString()} catalog entries (${errors} errors).`);
  await pool.end();
}

// Quick seed from Open Library API (for small initial dataset)
async function seedFromAPI(queries: string[]) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log("Seeding catalog from Open Library API...");

  for (const query of queries) {
    try {
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=50&fields=title,author_name,first_publish_year,publisher,isbn,cover_i,subject,language,key`;
      const res = await fetch(url);
      const data = await res.json() as any;

      const entries = (data.docs || []).map((doc: any) => ({
        title: doc.title,
        author: doc.author_name?.[0] || "Unknown",
        isbn13: doc.isbn?.find((i: string) => i.length === 13) || null,
        isbn10: doc.isbn?.find((i: string) => i.length === 10) || null,
        openLibraryId: doc.key,
        firstPublishedYear: doc.first_publish_year || null,
        publisher: doc.publisher?.[0] || null,
        language: langMap[doc.language?.[0]] || doc.language?.[0] || "English",
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
        subjects: doc.subject?.slice(0, 10).join(",") || null,
        source: "open_library",
        sourceId: doc.key,
      }));

      if (entries.length > 0) {
        await db.insert(bookCatalog).values(entries).onConflictDoNothing({ target: bookCatalog.openLibraryId });
        console.log(`  "${query}": ${entries.length} entries`);
      }

      // Respect rate limit
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`  "${query}": failed -`, e);
    }
  }

  const [{ count }] = await db.select({ count: require("drizzle-orm").sql<number>`count(*)::int` }).from(bookCatalog);
  console.log(`\nCatalog now has ${count} entries.`);
  await pool.end();
}

// CLI
const args = process.argv.slice(2);
if (args[0] === "--api") {
  // Seed with diverse worldwide queries
  seedFromAPI([
    // Major literary traditions
    "world literature", "nobel prize literature",
    // East Asian
    "japanese literature", "korean literature", "chinese classic literature",
    "manga", "manhwa",
    // Middle Eastern
    "arabic literature", "persian poetry", "quran",
    "turkish literature", "ottoman literature",
    // South Asian
    "hindi literature", "bengali literature", "sanskrit",
    "urdu poetry", "tamil literature",
    // Eastern European & Slavic
    "serbian literature", "yugoslav literature",
    "russian literature classic", "soviet science fiction",
    "czech literature", "polish literature",
    // African
    "african literature", "nigerian literature",
    "ethiopian literature",
    // Latin American
    "latin american literature", "brazilian literature",
    // Religious
    "torah talmud", "buddhist texts", "hindu scripture",
    "islamic philosophy", "christian theology classic",
    // Historical
    "antique books pre 1900", "medieval manuscripts",
    "samizdat soviet", "banned books",
  ]).catch(console.error);
} else if (args[0]) {
  importFromDump(args[0]).catch(console.error);
} else {
  console.log(`
Unshelv'd — Book Catalog Import Tool

Usage:
  # Quick seed from API (small dataset, good for dev):
  DATABASE_URL=... npx tsx server/catalog-import.ts --api

  # Full import from Open Library dump (40M+ records):
  # First download: wget https://openlibrary.org/data/ol_dump_editions_latest.txt.gz
  DATABASE_URL=... npx tsx server/catalog-import.ts ol_dump_editions_latest.txt.gz
  `);
}
