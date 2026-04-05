/**
 * One-time script to backfill workId for all entries in the book_catalog.
 *
 * This script iterates through all catalog entries that haven't been linked
 * to a work, calls the resolveWork engine for each, and updates the DB.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx server/link-works.ts
 */
import { db } from "./storage";
import { bookCatalog } from "@shared/schema";
import { isNull, eq } from "drizzle-orm";
import { resolveWork, updateWorkStats } from "./work-resolver";

async function main() {
  console.log(
    "🔗 Starting work resolution for all unlinked catalog entries...",
  );

  const unlinkedEntries = await db
    .select()
    .from(bookCatalog)
    .where(isNull(bookCatalog.workId));

  console.log(`Found ${unlinkedEntries.length} entries to process.`);
  let count = 0;
  const total = unlinkedEntries.length;

  for (const entry of unlinkedEntries) {
    count++;
    try {
      console.log(
        `[${count}/${total}] Resolving: "${entry.title}" by ${entry.author}`,
      );
      const result = await resolveWork({
        title: entry.title,
        author: entry.author,
        isbn: entry.isbn13 || entry.isbn10,
        language: entry.language,
        year: entry.publicationYear,
        coverUrl: entry.coverUrl,
        openLibraryId: entry.openLibraryId || undefined,
      });

      // Link the catalog entry to the resolved work
      await db
        .update(bookCatalog)
        .set({ workId: result.workId })
        .where(eq(bookCatalog.id, entry.id));

      // Update the work's denormalized stats
      await updateWorkStats(result.workId);
    } catch (err: any) {
      console.error(`Failed to resolve "${entry.title}":`, err.message);
    }
  }

  console.log("✅ All entries processed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
