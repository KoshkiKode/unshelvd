/**
 * Unshelv'd — Background Job Runner
 *
 * Provides recurring maintenance jobs that need to run on a schedule:
 *
 *   • autoCompleteTransactions  — marks shipped transactions as completed
 *     after AUTO_COMPLETE_DAYS (default 14).  Sends email to both parties.
 *
 *   • expireOffers              — marks pending offers as "expired" after
 *     OFFER_EXPIRY_DAYS (default 7).
 *
 * Cloud Run safety:
 *   Multiple Cloud Run instances can run simultaneously.  Each job acquires
 *   a PostgreSQL advisory lock before executing so only one instance
 *   processes the job at a time — the others skip that run silently.
 *
 * Usage (from server/index.ts, after httpServer.listen()):
 *   startJobs().catch(err => console.error('[jobs] startup failed:', err));
 */

import { pool } from "./storage";
import { db } from "./storage";
import { transactions, books, users } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { confirmDelivery } from "./payments";
import {
  sendAutoCompleted,
  sendOrderCancelled,
} from "./email";

// ── Configuration ──────────────────────────────────────────────────────────

/** Days after shipping before a transaction is auto-completed. */
const AUTO_COMPLETE_DAYS = 14;
/** Days after creation before a pending offer is expired. */
const OFFER_EXPIRY_DAYS = 7;
/** Hours before an abandoned pending checkout is cancelled and the book re-listed. */
const PENDING_EXPIRY_HOURS = 72;
/** How often to run maintenance jobs (in milliseconds). */
const JOB_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

// Stable integer advisory lock IDs (must be unique across all jobs).
const LOCK_AUTO_COMPLETE = 8301; // arbitrary unique int
const LOCK_EXPIRE_OFFERS = 8302;
const LOCK_EXPIRE_PENDING = 8303;

// ── Advisory lock helper ───────────────────────────────────────────────────

/**
 * Try to acquire a PostgreSQL session-level advisory lock, run `fn`, then
 * release the lock.  If another instance already holds the lock this call
 * returns without running `fn` (no wait, no error).
 */
async function withAdvisoryLock(
  lockId: number,
  fn: () => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1)",
      [lockId],
    );
    if (!rows[0]?.pg_try_advisory_lock) {
      // Another instance holds the lock — skip this run
      return;
    }
    try {
      await fn();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    }
  } catch (err) {
    // Log but never crash the process
    console.error(`[jobs] Advisory lock error for lockId=${lockId}:`, err);
  } finally {
    client.release();
  }
}

// ── Job: Auto-complete shipped transactions ────────────────────────────────

async function autoCompleteTransactions(): Promise<void> {
  await withAdvisoryLock(LOCK_AUTO_COMPLETE, async () => {
    const cutoff = new Date(
      Date.now() - AUTO_COMPLETE_DAYS * 24 * 60 * 60 * 1000,
    );

    const stale = await db
      .select({
        id: transactions.id,
        buyerId: transactions.buyerId,
        sellerId: transactions.sellerId,
        bookId: transactions.bookId,
        sellerPayout: transactions.sellerPayout,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, "shipped"),
          lt(transactions.shippedAt, cutoff),
        ),
      );

    if (stale.length === 0) return;

    console.log(
      `[jobs] Auto-completing ${stale.length} stale transaction(s)...`,
    );

    for (const tx of stale) {
      try {
        // confirmDelivery handles the Stripe transfer + status update + stats
        await confirmDelivery(tx.id, tx.buyerId);

        // Fetch book title for emails
        const [book] = await db
          .select({ title: books.title })
          .from(books)
          .where(eq(books.id, tx.bookId));
        const bookTitle = book?.title ?? "Unknown book";

        // Fetch buyer and seller emails
        const [buyer] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, tx.buyerId));
        const [seller] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, tx.sellerId));

        if (buyer?.email) {
          sendAutoCompleted(buyer.email, "buyer", bookTitle).catch((err) =>
            console.error("[jobs] email error (buyer auto-complete):", err),
          );
        }
        if (seller?.email) {
          sendAutoCompleted(seller.email, "seller", bookTitle).catch((err) =>
            console.error("[jobs] email error (seller auto-complete):", err),
          );
        }

        console.log(`[jobs] Auto-completed transaction ${tx.id}`);
      } catch (err) {
        console.error(`[jobs] Failed to auto-complete transaction ${tx.id}:`, err);
      }
    }
  });
}

// ── Job: Expire stale offers ───────────────────────────────────────────────

async function expireOffers(): Promise<void> {
  await withAdvisoryLock(LOCK_EXPIRE_OFFERS, async () => {
    const cutoff = new Date(
      Date.now() - OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const result = await db.execute(
      sql`UPDATE offers
          SET status = 'expired'
          WHERE status = 'pending'
            AND created_at < ${cutoff}
          RETURNING id`,
    );

    const count = (result as { rowCount?: number | null }).rowCount ?? 0;
    if (count > 0) {
      console.log(`[jobs] Expired ${count} stale offer(s)`);
    }
  });
}

// ── Job: Cancel abandoned pending transactions ─────────────────────────────

/**
 * Finds checkout sessions (status="pending") that the buyer started but never
 * completed, and that are older than PENDING_EXPIRY_HOURS.  Re-lists the book
 * and emails the buyer so they know the reservation expired.
 *
 * These accumulate when buyers:
 *   • Abandon the Stripe checkout before paying
 *   • Navigate away from the PayPal approval page
 */
async function expireAbandonedTransactions(): Promise<void> {
  await withAdvisoryLock(LOCK_EXPIRE_PENDING, async () => {
    const cutoff = new Date(
      Date.now() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    const stale = await db
      .select({
        id: transactions.id,
        buyerId: transactions.buyerId,
        bookId: transactions.bookId,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.status, "pending"),
          lt(transactions.createdAt, cutoff),
        ),
      );

    if (stale.length === 0) return;

    console.log(
      `[jobs] Expiring ${stale.length} abandoned pending transaction(s)...`,
    );

    for (const tx of stale) {
      try {
        // Mark as cancelled
        await db
          .update(transactions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(eq(transactions.id, tx.id), eq(transactions.status, "pending")));

        // Re-list the book
        await db
          .update(books)
          .set({ status: "for-sale" })
          .where(eq(books.id, tx.bookId));

        // Notify the buyer (fire-and-forget)
        const [buyer] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, tx.buyerId));
        const [book] = await db
          .select({ title: books.title })
          .from(books)
          .where(eq(books.id, tx.bookId));

        if (buyer?.email && book?.title) {
          sendOrderCancelled(buyer.email, "buyer", book.title).catch((err) =>
            console.error("[jobs] email error (abandoned tx expiry):", err),
          );
        }

        console.log(`[jobs] Expired abandoned transaction ${tx.id}`);
      } catch (err) {
        console.error(`[jobs] Failed to expire transaction ${tx.id}:`, err);
      }
    }
  });
}

// ── Scheduler ─────────────────────────────────────────────────────────────

/**
 * Start the background job scheduler.
 *
 * Runs each job once immediately on startup (to catch anything that missed
 * the last run), then repeats every JOB_INTERVAL_MS.
 *
 * Call this AFTER httpServer.listen() so Cloud Run binds to PORT on time.
 */
export async function startJobs(): Promise<void> {
  console.log(
    `[jobs] Starting background job runner (interval: ${JOB_INTERVAL_MS / 3600000}h)`,
  );

  // Run once at startup (non-fatal)
  const runAll = () => {
    autoCompleteTransactions().catch((err) =>
      console.error("[jobs] autoCompleteTransactions error:", err),
    );
    expireOffers().catch((err) =>
      console.error("[jobs] expireOffers error:", err),
    );
    expireAbandonedTransactions().catch((err) =>
      console.error("[jobs] expireAbandonedTransactions error:", err),
    );
  };

  runAll();

  // Schedule recurring runs
  setInterval(runAll, JOB_INTERVAL_MS);
}
