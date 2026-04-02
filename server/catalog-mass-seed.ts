/**
 * Mass catalog seeder — pulls thousands of books from Open Library
 * Covers every major literary tradition, language, era, and genre worldwide.
 * 
 * Usage: DATABASE_URL=... npx tsx server/catalog-mass-seed.ts
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { bookCatalog } from "@shared/schema";
import { sql } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const RESULTS_PER_QUERY = 100; // max Open Library returns
const DELAY_MS = 600; // be nice to OL servers

// Cover URL — small size (S = small, M = medium)
const coverUrl = (coverId: number) => `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;

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
  alb: "Albanian", mac: "Macedonian", kaz: "Kazakh", uzb: "Uzbek",
};

// ALL the queries — organized by category
const queries = [
  // === WORLD LITERATURE (Nobel, classics) ===
  "nobel prize literature", "world literature classics", "penguin classics",
  "oxford world classics", "everyman library", "modern library 100 best",
  
  // === ENGLISH ===
  "shakespeare complete works", "dickens novels", "jane austen", "mark twain",
  "virginia woolf", "james joyce ulysses", "george orwell", "aldous huxley",
  "ernest hemingway", "f scott fitzgerald", "toni morrison", "william faulkner",
  "herman melville moby dick", "edgar allan poe", "emily dickinson poetry",
  "walt whitman leaves grass", "kurt vonnegut", "philip roth", "don delillo",
  "cormac mccarthy", "thomas pynchon", "salman rushdie", "zadie smith",
  
  // === RUSSIAN ===
  "tolstoy war peace", "dostoevsky brothers karamazov", "chekhov stories",
  "pushkin eugene onegin", "gogol dead souls", "turgenev fathers sons",
  "bulgakov master margarita", "solzhenitsyn gulag", "nabokov lolita",
  "pasternak doctor zhivago", "akhmatova poems", "mayakovsky poetry",
  "strugatsky science fiction", "russian literature classic",
  
  // === FRENCH ===
  "victor hugo les miserables", "proust recherche temps perdu", "camus stranger",
  "sartre nausea", "flaubert madame bovary", "baudelaire fleurs mal",
  "moliere comedies", "voltaire candide", "dumas three musketeers",
  "stendhal red black", "zola germinal", "balzac comedie humaine",
  
  // === GERMAN ===
  "goethe faust", "kafka metamorphosis trial", "thomas mann magic mountain",
  "hermann hesse steppenwolf", "rilke poetry", "brecht threepenny opera",
  "nietzsche zarathustra", "schiller", "heinrich boll", "gunter grass tin drum",
  
  // === SPANISH ===
  "cervantes don quixote", "garcia marquez hundred years solitude",
  "borges ficciones", "neruda poetry", "isabel allende house spirits",
  "octavio paz labyrinth solitude", "julio cortazar hopscotch",
  "carlos fuentes", "mario vargas llosa", "roberto bolano 2666",
  
  // === PORTUGUESE ===
  "fernando pessoa book disquiet", "jose saramago blindness",
  "machado de assis", "clarice lispector", "jorge amado",
  
  // === ITALIAN ===
  "dante divine comedy", "boccaccio decameron", "eco name rose",
  "calvino invisible cities", "primo levi", "pirandello", "leopardi poems",
  
  // === JAPANESE ===
  "murakami haruki", "mishima yukio", "kawabata yasunari snow country",
  "oe kenzaburo", "tanizaki junichiro", "murasaki shikibu tale genji",
  "banana yoshimoto", "natsume soseki", "japanese manga classic",
  "japanese literature modern",
  
  // === CHINESE ===
  "dream red chamber", "romance three kingdoms", "journey west",
  "water margin outlaws marsh", "lu xun", "mo yan", "yu hua to live",
  "chinese poetry classic tang", "cao xueqin", "confucius analects",
  "lao tzu tao te ching", "chinese literature modern",
  
  // === KOREAN ===
  "korean literature modern", "han kang vegetarian", "shin kyung-sook",
  "hwang sok-yong", "yi kwang-su", "korean fiction",
  
  // === ARABIC & PERSIAN ===
  "quran translations", "arabian nights thousand one", "naguib mahfouz cairo",
  "mahmoud darwish poetry", "khalil gibran prophet", "ibn khaldun muqaddimah",
  "rumi poetry masnavi", "hafez poetry divan", "omar khayyam rubaiyat",
  "shahnameh ferdowsi", "arabic literature classic", "persian poetry classic",
  
  // === TURKISH ===
  "orhan pamuk istanbul", "elif shafak", "yashar kemal", "nazim hikmet poetry",
  "turkish literature",
  
  // === SOUTH ASIAN ===
  "tagore gitanjali", "r k narayan", "arundhati roy god small things",
  "vikram seth suitable boy", "amitav ghosh", "rohinton mistry",
  "mahabharata", "ramayana", "bhagavad gita", "upanishads",
  "hindi literature modern", "urdu poetry ghazal", "bengali literature",
  "tamil literature sangam",
  
  // === AFRICAN ===
  "chinua achebe things fall apart", "ngugi wa thiongo",
  "chimamanda ngozi adichie", "wole soyinka", "ben okri famished road",
  "nadine gordimer", "j m coetzee disgrace", "african literature",
  
  // === YUGOSLAV / BALKAN ===
  "ivo andric bridge drina", "mesa selimovic", "danilo kis",
  "miroslav krleza", "vasko popa poetry", "dubravka ugresic",
  "serbian literature", "croatian literature", "bosnian literature",
  "yugoslav literature", "macedonian literature",
  
  // === SOVIET / EASTERN EUROPEAN ===
  "czech literature kafka kundera hasek", "milan kundera unbearable lightness",
  "hasek good soldier svejk", "stanislav lem solaris",
  "polish literature gombrowicz szymborska",
  "hungarian literature", "romanian literature", "bulgarian literature",
  
  // === CENTRAL ASIAN ===
  "kazakh literature", "uzbek literature", "kyrgyz literature",
  "abai kunanbayev", "chingiz aitmatov",
  
  // === NORDIC / SCANDINAVIAN ===
  "ibsen peer gynt", "strindberg", "knut hamsun hunger",
  "sigrid undset kristin lavransdatter", "halldor laxness",
  "nordic noir crime fiction", "scandinavian literature classic",
  
  // === GENRES ===
  "science fiction classic asimov clarke", "fantasy tolkien lord rings",
  "horror lovecraft shelley", "mystery detective agatha christie",
  "romance classic bronte", "philosophy plato aristotle",
  "history ancient rome greece", "biography autobiography memoir",
  "poetry anthology world", "art history",
  
  // === RELIGIOUS / SACRED ===
  "bible translations", "quran tafsir", "torah talmud commentary",
  "buddhist texts sutras", "hindu scriptures vedas", "sufi literature",
  "christian theology augustine aquinas", "bhagavad gita translations",
  
  // === RARE / ANTIQUARIAN ===
  "first edition rare books", "incunabula early printing",
  "illuminated manuscripts", "antique books 19th century",
  "samizdat soviet underground", "banned books history",
  
  // === CHILDREN'S & GRAPHIC ===
  "children classic literature", "graphic novel award winning",
  "manga bestselling", "comic book classic",
  
  // === NON-FICTION ===
  "economics adam smith marx", "science darwin einstein",
  "psychology freud jung", "political theory machiavelli",
  "feminist literature beauvoir woolf", "civil rights literature",
  "travel writing classic", "food cooking history",
];

async function searchAndInsert(query: string): Promise<number> {
  try {
    const fields = "title,author_name,first_publish_year,publisher,isbn,cover_i,subject,language,key,edition_count";
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${RESULTS_PER_QUERY}&fields=${fields}`;
    
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return 0;
    
    const data = await res.json() as any;
    if (!data.docs?.length) return 0;

    const entries = data.docs
      .filter((doc: any) => doc.title && doc.author_name?.[0])
      .map((doc: any) => {
        const lang3 = doc.language?.[0];
        return {
          title: doc.title.substring(0, 500),
          author: doc.author_name[0].substring(0, 200),
          isbn13: doc.isbn?.find((i: string) => i.length === 13) || null,
          isbn10: doc.isbn?.find((i: string) => i.length === 10) || null,
          openLibraryId: doc.key || null,
          publisher: doc.publisher?.[0]?.substring(0, 200) || null,
          firstPublishedYear: doc.first_publish_year || null,
          language: langMap[lang3] || lang3 || "English",
          coverUrl: doc.cover_i ? coverUrl(doc.cover_i) : null,
          subjects: doc.subject?.slice(0, 10).join(",").substring(0, 500) || null,
          source: "open_library",
          sourceId: doc.key || null,
        };
      });

    if (entries.length > 0) {
      // Use ON CONFLICT DO NOTHING to skip duplicates
      await db.insert(bookCatalog).values(entries).onConflictDoNothing();
    }

    return entries.length;
  } catch (e) {
    return 0;
  }
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Unshelv'd — Mass Catalog Seeder              ║`);
  console.log(`║  ${queries.length} queries × ${RESULTS_PER_QUERY} results = up to ${(queries.length * RESULTS_PER_QUERY).toLocaleString()} books  ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  let totalInserted = 0;
  let completed = 0;

  for (const query of queries) {
    const count = await searchAndInsert(query);
    totalInserted += count;
    completed++;
    
    if (count > 0) {
      process.stdout.write(`  [${completed}/${queries.length}] "${query}" → ${count} books (total: ${totalInserted.toLocaleString()})\n`);
    } else {
      process.stdout.write(`  [${completed}/${queries.length}] "${query}" → skipped\n`);
    }

    // Rate limit: be nice to Open Library
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Get final count from DB
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(bookCatalog);

  console.log(`\n══════════════════════════════════════════════`);
  console.log(`  Done! Catalog now has ${count.toLocaleString()} entries.`);
  console.log(`  Inserted ${totalInserted.toLocaleString()} from ${queries.length} queries.`);
  console.log(`══════════════════════════════════════════════\n`);

  await pool.end();
}

main().catch(console.error);
