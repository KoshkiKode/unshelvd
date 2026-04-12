/**
 * Unshelv'd — Payment Engine (Stripe Connect)
 * 
 * Architecture: Separate Charges + Transfers
 * - Buyer pays → money goes to Unshelv'd's Stripe account
 * - Money held until buyer confirms delivery
 * - Then transferred to seller's connected Stripe account
 * - Platform fee stays in Unshelv'd's account
 * 
 * Seller onboarding: Stripe Express accounts
 * - Stripe handles KYC, identity verification, bank account setup
 * - Sellers get a Stripe-hosted onboarding page
 * - One-time setup per seller
 */

import Stripe from "stripe";
import { db } from "./storage";
import { transactions, books, users } from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { getSetting, isEnabled } from "./platform-settings";

// Platform fee: configurable, default 10%
export const PLATFORM_FEE_PERCENT = 0.10;

// Stripe initialization
// Priority: DB setting (admin-configured) → environment variable
// Using a function so we always get the latest key without restarting.
const _stripeCache: { instance: Stripe | null; key: string | null } = {
  instance: null,
  key: null,
};

export async function getStripe(): Promise<Stripe | null> {
  // DB setting takes priority over env var
  const dbKey = await getSetting("stripe_secret_key");
  const key = dbKey || process.env.STRIPE_SECRET_KEY || null;

  if (!key) return null;

  // Re-use cached instance if key hasn't changed
  if (_stripeCache.instance && _stripeCache.key === key) {
    return _stripeCache.instance;
  }

  _stripeCache.instance = new Stripe(key);
  _stripeCache.key = key;
  return _stripeCache.instance;
}

/** True when Stripe is configured and enabled. */
export async function isStripeEnabled(): Promise<boolean> {
  const enabled = await isEnabled("stripe_enabled", true);
  if (!enabled) return false;
  const s = await getStripe();
  return s !== null;
}

// NOTE: Do NOT use a static `stripe` singleton — the admin can update the
// Stripe key via the admin panel and we must pick it up without a restart.
// Always call getStripe() inside async functions.

async function calculateFees(amount: number) {
  const dbFeeStr = await getSetting("platform_fee_percent");
  const dbFee = dbFeeStr !== null ? parseFloat(dbFeeStr) : NaN;
  const feePercent = !isNaN(dbFee) && dbFee >= 0 && dbFee <= 100
    ? dbFee / 100
    : PLATFORM_FEE_PERCENT;
  const platformFee = Math.round(amount * feePercent * 100) / 100;
  const sellerPayout = Math.round((amount - platformFee) * 100) / 100;
  return { platformFee, sellerPayout };
}

// ═══════════════════════════════════════
// SELLER ONBOARDING (Stripe Express)
// ═══════════════════════════════════════

/**
 * Create a Stripe Express account for a seller and return the onboarding URL.
 * The seller clicks this link to set up their bank account and verify identity.
 */
export async function createSellerAccount(userId: number, returnUrl: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  const s = await getStripe();

  // Already has a Stripe account
  if (user.stripeAccountId) {
    // Check if onboarding is complete
    if (s) {
      const account = await s.accounts.retrieve(user.stripeAccountId);
      if (account.details_submitted) {
        await db.update(users).set({ stripeOnboarded: true }).where(eq(users.id, userId));
        return { alreadyOnboarded: true, accountId: user.stripeAccountId };
      }
      // Onboarding incomplete — generate a new link
      const link = await s.accountLinks.create({
        account: user.stripeAccountId,
        refresh_url: `${returnUrl}?stripe=refresh`,
        return_url: `${returnUrl}?stripe=complete`,
        type: "account_onboarding",
      });
      return { onboardingUrl: link.url, accountId: user.stripeAccountId };
    }
    return { alreadyOnboarded: true, accountId: user.stripeAccountId };
  }

  if (!s) {
    // Dev mode — fake it
    const fakeId = `acct_dev_${userId}`;
    await db.update(users).set({ stripeAccountId: fakeId, stripeOnboarded: true }).where(eq(users.id, userId));
    return { alreadyOnboarded: true, accountId: fakeId, devMode: true };
  }

  // Create new Express account
  const account = await s.accounts.create({
    type: "express",
    email: user.email,
    metadata: { userId: String(userId), username: user.username },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  // Save the account ID
  await db.update(users).set({ stripeAccountId: account.id }).where(eq(users.id, userId));

  // Generate onboarding link
  const link = await s.accountLinks.create({
    account: account.id,
    refresh_url: `${returnUrl}?stripe=refresh`,
    return_url: `${returnUrl}?stripe=complete`,
    type: "account_onboarding",
  });

  return { onboardingUrl: link.url, accountId: account.id };
}

/**
 * Check if a seller's Stripe account is ready to receive payments
 */
export async function checkSellerStatus(userId: number) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("User not found");

  if (!user.stripeAccountId) {
    return { connected: false, onboarded: false };
  }

  const s = await getStripe();
  if (!s) {
    return { connected: true, onboarded: true, devMode: true };
  }

  const account = await s.accounts.retrieve(user.stripeAccountId);
  const onboarded = account.details_submitted || false;

  if (onboarded && !user.stripeOnboarded) {
    await db.update(users).set({ stripeOnboarded: true }).where(eq(users.id, userId));
  }

  return {
    connected: true,
    onboarded,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}

// ═══════════════════════════════════════
// CHECKOUT (Separate Charges)
// ═══════════════════════════════════════

/**
 * Create a payment intent. Money goes to Unshelv'd's account (not the seller).
 * We transfer to the seller later after delivery confirmation.
 */
export async function createPaymentIntent(buyerId: number, bookId: number, offerId?: number) {
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  if (!book) throw new Error("Book not found");
  if (book.userId === buyerId) throw new Error("Cannot buy your own book");
  if (book.status !== "for-sale" && book.status !== "open-to-offers") {
    throw new Error("Book is not for sale");
  }

  let amount = book.price;
  if (!amount || amount <= 0) throw new Error("Book has no price set");

  const { platformFee, sellerPayout } = await calculateFees(amount);

  const [seller] = await db.select().from(users).where(eq(users.id, book.userId));
  if (!seller) throw new Error("Seller not found");

  // Create transaction record
  const [transaction] = await db.insert(transactions).values({
    buyerId,
    sellerId: book.userId,
    bookId,
    offerId: offerId || null,
    amount,
    platformFee,
    sellerPayout,
    status: "pending",
  }).returning();

  let clientSecret: string | null = null;

  const s = await getStripe();
  if (s) {
    // Create PaymentIntent on OUR account (not the seller's)
    // Money comes to us first — we transfer to seller after delivery
    // Idempotency key prevents duplicate charges if the request is retried.
    const paymentIntent = await s.paymentIntents.create({
      amount: Math.round(amount * 100), // cents
      currency: "usd",
      metadata: {
        transactionId: String(transaction.id),
        bookId: String(bookId),
        buyerId: String(buyerId),
        sellerId: String(book.userId),
        platformFee: String(platformFee),
        sellerPayout: String(sellerPayout),
      },
      // Automatic payment methods — supports cards, Apple Pay, Google Pay, etc.
      automatic_payment_methods: { enabled: true },
    }, { idempotencyKey: `checkout_${transaction.id}` });

    clientSecret = paymentIntent.client_secret;

    await db.update(transactions)
      .set({ stripePaymentIntentId: paymentIntent.id })
      .where(eq(transactions.id, transaction.id));
  }

  return {
    transactionId: transaction.id,
    clientSecret,
    amount,
    platformFee,
    sellerPayout,
    stripeConfigured: !!s,
    book: { id: book.id, title: book.title, author: book.author, coverUrl: book.coverUrl },
    seller: { id: seller.id, displayName: seller.displayName, username: seller.username },
  };
}

// ═══════════════════════════════════════
// POST-PAYMENT FLOW
// ═══════════════════════════════════════

export async function confirmPayment(transactionId: number, userId: number) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) throw new Error("Transaction not found");
  if (tx.buyerId !== userId) throw new Error("Not your transaction");
  // Idempotent: webhook and browser client may both call this; treat already-paid as success.
  if (tx.status === "paid") return { status: "paid" };
  if (tx.status !== "pending") throw new Error("Transaction already processed");

  const s = await getStripe();
  if (s && tx.stripePaymentIntentId) {
    const pi = await s.paymentIntents.retrieve(tx.stripePaymentIntentId);
    if (pi.status !== "succeeded") throw new Error("Payment not confirmed by Stripe");
  }

  await db.update(transactions).set({ status: "paid", updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));

  await db.update(books).set({ status: "not-for-sale" }).where(eq(books.id, tx.bookId));

  return { status: "paid" };
}

export async function markShipped(transactionId: number, userId: number, carrier?: string, tracking?: string) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) throw new Error("Transaction not found");
  if (tx.sellerId !== userId) throw new Error("Not your sale");
  if (tx.status !== "paid") throw new Error("Payment not confirmed yet");

  await db.update(transactions).set({
    status: "shipped",
    shippingCarrier: carrier || null,
    trackingNumber: tracking || null,
    shippedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(transactions.id, transactionId));

  return { status: "shipped" };
}

/**
 * Buyer confirms delivery → transfer funds to seller's Stripe account
 */
export async function confirmDelivery(transactionId: number, userId: number) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) throw new Error("Transaction not found");
  if (tx.buyerId !== userId) throw new Error("Not your purchase");
  // Idempotent: treat already-completed as success (webhook + browser may both call this)
  if (tx.status === "completed") return { status: "completed" };
  if (tx.status !== "shipped") throw new Error("Not shipped yet");

  // Transfer seller's payout to their connected Stripe account
  const s = await getStripe();
  if (s) {
    const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
    if (seller?.stripeAccountId) {
      const transfer = await s.transfers.create({
        amount: Math.round(tx.sellerPayout * 100), // cents
        currency: "usd",
        destination: seller.stripeAccountId,
        metadata: {
          transactionId: String(tx.id),
          bookId: String(tx.bookId),
        },
        // Idempotency key: one transfer per transaction regardless of retries
      }, { idempotencyKey: `transfer_${transactionId}` });

      await db.update(transactions)
        .set({ stripeTransferId: transfer.id })
        .where(eq(transactions.id, transactionId));
    }
  }

  await db.update(transactions).set({
    status: "completed",
    deliveredAt: new Date(),
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(transactions.id, transactionId));

  // Atomic increments — no read-then-write race condition
  await db.update(users)
    .set({ totalSales: sql`${users.totalSales} + 1` })
    .where(eq(users.id, tx.sellerId));
  await db.update(users)
    .set({ totalPurchases: sql`${users.totalPurchases} + 1` })
    .where(eq(users.id, tx.buyerId));

  return { status: "completed" };
}

/**
 * Called by webhook: payment failed (card declined, etc.)
 * Re-opens the book for sale so the seller isn't stuck.
 */
export async function failPayment(paymentIntentId: string) {
  const [tx] = await db.select().from(transactions)
    .where(eq(transactions.stripePaymentIntentId, paymentIntentId));
  if (!tx || tx.status !== "pending") return;

  await db.update(transactions)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(transactions.id, tx.id));

  await db.update(books).set({ status: "for-sale" }).where(eq(books.id, tx.bookId));
}

/**
 * Called by webhook: seller completed Stripe onboarding.
 * Updates stripeOnboarded without requiring a page refresh.
 */
export async function handleSellerAccountUpdated(
  stripeAccountId: string,
  detailsSubmitted: boolean,
  chargesEnabled: boolean,
) {
  if (detailsSubmitted && chargesEnabled) {
    await db.update(users)
      .set({ stripeOnboarded: true })
      .where(eq(users.stripeAccountId, stripeAccountId));
  }
}

/**
 * Called by webhook: a transfer to a seller's account failed.
 * Flags the transaction as disputed so ops can investigate.
 */
export async function handleTransferFailed(transferId: string) {
  const [tx] = await db.select().from(transactions)
    .where(eq(transactions.stripeTransferId, transferId));
  if (!tx) return;

  await db.update(transactions)
    .set({ status: "disputed", updatedAt: new Date() })
    .where(eq(transactions.id, tx.id));
}

/**
 * Issue a refund for a transaction and re-list the book.
 * Allowed for pending / paid / shipped transactions.
 * Completed transactions (payout already sent) cannot be automatically reversed.
 */
export async function refundPayment(transactionId: number) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) throw new Error("Transaction not found");

  const refundableStatuses = ["pending", "paid", "shipped"];
  if (!tx.status || !refundableStatuses.includes(tx.status)) {
    throw new Error(`Cannot refund a transaction with status "${tx.status}"`);
  }

  // Issue Stripe refund when a PaymentIntent was created and the payment may have been captured.
  // "pending" transactions have a PaymentIntent but the buyer has not paid yet, so there
  // is nothing to refund through Stripe; we just cancel the record in our DB.
  const s = await getStripe();
  if (s && tx.stripePaymentIntentId && tx.status !== "pending") {
    await s.refunds.create(
      { payment_intent: tx.stripePaymentIntentId },
      { idempotencyKey: `refund_${transactionId}` },
    );
  }

  await db.update(transactions)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(transactions.id, transactionId));

  // Re-list the book so the seller can sell it again.
  await db.update(books).set({ status: "for-sale" }).where(eq(books.id, tx.bookId));

  return { status: "refunded" };
}

/**
 * Called by webhook: a charge was refunded (e.g. via Stripe Dashboard).
 * Syncs the transaction status without re-issuing a duplicate API refund.
 */
export async function handleChargeRefunded(paymentIntentId: string) {
  const [tx] = await db.select().from(transactions)
    .where(eq(transactions.stripePaymentIntentId, paymentIntentId));
  if (!tx || tx.status === "refunded") return;

  await db.update(transactions)
    .set({ status: "refunded", updatedAt: new Date() })
    .where(eq(transactions.id, tx.id));

  // Only re-list the book if it hasn't already been delivered — a post-delivery
  // chargeback (status "completed") means the book is physically with the buyer
  // and re-listing it would be misleading.
  if (tx.status !== "completed") {
    await db.update(books).set({ status: "for-sale" }).where(eq(books.id, tx.bookId));
  }
}

export async function getUserTransactions(userId: number) {
  const purchases = await db.select().from(transactions).where(eq(transactions.buyerId, userId)).orderBy(desc(transactions.id));
  const sales = await db.select().from(transactions).where(eq(transactions.sellerId, userId)).orderBy(desc(transactions.id));

  const enrich = async (tx: typeof transactions.$inferSelect) => {
    const [book] = await db.select().from(books).where(eq(books.id, tx.bookId));
    const [buyer] = await db.select().from(users).where(eq(users.id, tx.buyerId));
    const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
    return {
      ...tx,
      book: book ? { id: book.id, title: book.title, author: book.author, coverUrl: book.coverUrl } : null,
      buyer: buyer ? { id: buyer.id, displayName: buyer.displayName, username: buyer.username } : null,
      seller: seller ? { id: seller.id, displayName: seller.displayName, username: seller.username } : null,
    };
  };

  return {
    purchases: await Promise.all(purchases.map(enrich)),
    sales: await Promise.all(sales.map(enrich)),
  };
}
