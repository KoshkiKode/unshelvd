/**
 * Work Resolver Engine
 * 
 * Automatically matches books/editions to their canonical "work" entity.
 * 
 * Strategy (in order):
 * 1. Open Library Work ID — if the book has an OL edition key, look up its work
 * 2. ISBN match — search OL by ISBN to find the work
 * 3. Title+Author fuzzy match — find existing works in our DB by normalized title+author
 * 4. Create new work — if no match, create a new work entry
 */

import { db } from "./storage";
import { works, books, bookCatalog } from "@shared/schema";
import { eq, and, ilike, sql, or } from "drizzle-orm";

// Normalize title for fuzzy matching
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(the|a|an|le|la|les|el|los|las|der|die|das|il|lo|gli|i)\s+/i, "")
    .replace(/[^a-z0-9\u0400-\u04FF\u3000-\u9FFF\uAC00-\uD7AF\u0600-\u06FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthor(author: string): string {
  return author
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\u3000-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface ResolveResult {
  workId: number;
  isNew: boolean;
  confidence: "exact" | "high" | "medium" | "created";
}

/**
 * Resolve a book to its work. Creates the work if it doesn't exist.
 */
export async function resolveWork(input: {
  title: string;
  author: string;
  isbn?: string | null;
  language?: string | null;
  originalLanguage?: string | null;
  year?: number | null;
  openLibraryId?: string | null;
  coverUrl?: string | null;
  genre?: string | null;
}): Promise<ResolveResult> {

  // Strategy 1: Try Open Library work lookup via ISBN
  if (input.isbn) {
    const olWork = await resolveViaOpenLibrary(input.isbn);
    if (olWork) {
      // Check if we already have this OL work
      const existing = await db.select().from(works)
        .where(eq(works.openLibraryWorkId, olWork.workId));
      
      if (existing[0]) {
        return { workId: existing[0].id, isNew: false, confidence: "exact" };
      }

      // Create new work from OL data
      const [newWork] = await db.insert(works).values({
        title: olWork.title,
        author: olWork.author,
        openLibraryWorkId: olWork.workId,
        originalLanguage: input.originalLanguage || input.language || null,
        firstPublishedYear: olWork.firstPublishYear || input.year || null,
        coverUrl: olWork.coverUrl || input.coverUrl || null,
        genre: input.genre || null,
        description: olWork.description || null,
        editionCount: olWork.editionCount,
        source: "open_library",
      }).returning();

      return { workId: newWork.id, isNew: true, confidence: "exact" };
    }
  }

  // Strategy 2: Try Open Library work lookup via title+author search
  if (input.title && input.author) {
    const olWork = await searchOpenLibraryWork(input.title, input.author);
    if (olWork) {
      const existing = await db.select().from(works)
        .where(eq(works.openLibraryWorkId, olWork.workId));
      
      if (existing[0]) {
        return { workId: existing[0].id, isNew: false, confidence: "high" };
      }

      const [newWork] = await db.insert(works).values({
        title: olWork.title,
        author: olWork.author,
        openLibraryWorkId: olWork.workId,
        originalLanguage: input.originalLanguage || input.language || null,
        firstPublishedYear: olWork.firstPublishYear || input.year || null,
        coverUrl: olWork.coverUrl || input.coverUrl || null,
        genre: input.genre || null,
        description: olWork.description || null,
        editionCount: olWork.editionCount,
        source: "open_library",
      }).returning();

      return { workId: newWork.id, isNew: true, confidence: "high" };
    }
  }

  // Strategy 3: Fuzzy match against existing works in our DB
  const normTitle = normalizeTitle(input.title);
  const normAuthor = normalizeAuthor(input.author);
  
  if (normTitle && normAuthor) {
    const matches = await db.select().from(works).where(
      and(
        ilike(works.title, `%${normTitle.substring(0, 30)}%`),
        ilike(works.author, `%${normAuthor.split(" ").pop()!}%`)
      )
    );

    // Score matches
    for (const match of matches) {
      const matchNormTitle = normalizeTitle(match.title);
      const matchNormAuthor = normalizeAuthor(match.author);
      
      if (matchNormTitle === normTitle && matchNormAuthor === normAuthor) {
        return { workId: match.id, isNew: false, confidence: "high" };
      }
      
      // Check if one contains the other (handles subtitle variations)
      if (
        (matchNormTitle.includes(normTitle) || normTitle.includes(matchNormTitle)) &&
        (matchNormAuthor.includes(normAuthor) || normAuthor.includes(matchNormAuthor))
      ) {
        return { workId: match.id, isNew: false, confidence: "medium" };
      }
    }
  }

  // Strategy 4: Create a new work
  const [newWork] = await db.insert(works).values({
    title: input.title,
    author: input.author,
    originalLanguage: input.originalLanguage || input.language || null,
    firstPublishedYear: input.year || null,
    coverUrl: input.coverUrl || null,
    genre: input.genre || null,
    editionCount: 1,
    source: "manual",
  }).returning();

  return { workId: newWork.id, isNew: true, confidence: "created" };
}

/**
 * Update denormalized stats on a work (call after linking an edition)
 */
export async function updateWorkStats(workId: number) {
  // Count catalog editions linked to this work
  const [editionStats] = await db.select({
    count: sql<number>`count(*)::int`,
    languages: sql<number>`count(distinct ${bookCatalog.language})::int`,
  }).from(bookCatalog).where(eq(bookCatalog.workId, workId));

  // Count user listings linked to this work
  const [listingStats] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(books).where(
    and(
      eq(books.workId, workId),
      or(eq(books.status, "for-sale"), eq(books.status, "open-to-offers"))
    )
  );

  // Count translations (editions in different languages from original)
  const work = await db.select().from(works).where(eq(works.id, workId));
  let translationCount = 0;
  if (work[0]?.originalLanguage) {
    const [transStats] = await db.select({
      count: sql<number>`count(distinct ${bookCatalog.language})::int`,
    }).from(bookCatalog).where(
      and(
        eq(bookCatalog.workId, workId),
        sql`${bookCatalog.language} != ${work[0].originalLanguage}`
      )
    );
    translationCount = transStats?.count || 0;
  }

  await db.update(works).set({
    editionCount: editionStats?.count || 0,
    languageCount: editionStats?.languages || 0,
    translationCount,
    listingCount: listingStats?.count || 0,
    updatedAt: new Date(),
  }).where(eq(works.id, workId));
}

// ══════════════════════════════════════
// Open Library API helpers
// ══════════════════════════════════════

interface OLWorkResult {
  workId: string;
  title: string;
  author: string;
  firstPublishYear: number | null;
  coverUrl: string | null;
  editionCount: number;
  description: string | null;
}

async function resolveViaOpenLibrary(isbn: string): Promise<OLWorkResult | null> {
  try {
    const cleanIsbn = isbn.replace(/[^0-9X]/gi, "");
    const url = `https://openlibrary.org/isbn/${cleanIsbn}.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    
    const edition = await res.json() as any;
    const workKey = edition.works?.[0]?.key; // e.g. "/works/OL1168083W"
    if (!workKey) return null;

    // Fetch the work itself
    const workRes = await fetch(`https://openlibrary.org${workKey}.json`, { signal: AbortSignal.timeout(5000) });
    if (!workRes.ok) return null;
    
    const work = await workRes.json() as any;

    // Get author name
    let authorName = "Unknown";
    if (work.authors?.[0]?.author?.key) {
      try {
        const authRes = await fetch(`https://openlibrary.org${work.authors[0].author.key}.json`, { signal: AbortSignal.timeout(3000) });
        if (authRes.ok) {
          const authData = await authRes.json() as any;
          authorName = authData.name || "Unknown";
        }
      } catch { /* use default */ }
    }

    return {
      workId: workKey,
      title: work.title || edition.title,
      author: authorName,
      firstPublishYear: work.first_publish_date ? parseInt(work.first_publish_date) || null : null,
      coverUrl: work.covers?.[0] ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg` : null,
      editionCount: work.edition_count || 1,
      description: typeof work.description === "string" ? work.description : work.description?.value || null,
    };
  } catch {
    return null;
  }
}

async function searchOpenLibraryWork(title: string, author: string): Promise<OLWorkResult | null> {
  try {
    const q = encodeURIComponent(`${title} ${author}`);
    const url = `https://openlibrary.org/search.json?q=${q}&limit=3&fields=key,title,author_name,first_publish_year,cover_i,edition_count`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    
    const data = await res.json() as any;
    const doc = data.docs?.[0];
    if (!doc) return null;

    // Verify it's a reasonable match
    const normInput = normalizeTitle(title);
    const normResult = normalizeTitle(doc.title || "");
    if (!normResult.includes(normInput.substring(0, 10)) && !normInput.includes(normResult.substring(0, 10))) {
      return null; // Too different, skip
    }

    // Get the work key from the search result
    const workKey = doc.key; // e.g. "/works/OL1168083W"
    if (!workKey?.startsWith("/works/")) return null;

    return {
      workId: workKey,
      title: doc.title,
      author: doc.author_name?.[0] || author,
      firstPublishYear: doc.first_publish_year || null,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
      editionCount: doc.edition_count || 1,
      description: null,
    };
  } catch {
    return null;
  }
}

/**
 * Get all editions of a work, grouped by language
 */
export async function getWorkEditions(workId: number) {
  // Get catalog editions
  const catalogEditions = await db.select().from(bookCatalog)
    .where(eq(bookCatalog.workId, workId));
  
  // Get user listings
  const userListings = await db.select().from(books)
    .where(eq(books.workId, workId));

  // Group catalog editions by language
  const byLanguage = new Map<string, typeof catalogEditions>();
  for (const ed of catalogEditions) {
    const lang = ed.language || "Unknown";
    if (!byLanguage.has(lang)) byLanguage.set(lang, []);
    byLanguage.get(lang)!.push(ed);
  }

  // Group user listings by language
  const listingsByLanguage = new Map<string, typeof userListings>();
  for (const listing of userListings) {
    const lang = listing.language || "Unknown";
    if (!listingsByLanguage.has(lang)) listingsByLanguage.set(lang, []);
    listingsByLanguage.get(lang)!.push(listing);
  }

  return {
    catalogEditions: Object.fromEntries(byLanguage),
    userListings: Object.fromEntries(listingsByLanguage),
    languages: Array.from(new Set([...Array.from(byLanguage.keys()), ...Array.from(listingsByLanguage.keys())])),
    totalEditions: catalogEditions.length,
    totalListings: userListings.length,
  };
}
