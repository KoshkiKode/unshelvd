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
import { eq, desc } from "drizzle-orm";

// Platform fee: 10%
export const PLATFORM_FEE_PERCENT = 0.115;

// Stripe initialization
const stripeKey = process.env.STRIPE_SECRET_KEY;
export const stripe = stripeKey ? new Stripe(stripeKey) : null;

function calculateFees(amount: number) {
  const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT * 100) / 100;
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

  // Already has a Stripe account
  if (user.stripeAccountId) {
    // Check if onboarding is complete
    if (stripe) {
      const account = await stripe.accounts.retrieve(user.stripeAccountId);
      if (account.details_submitted) {
        await db.update(users).set({ stripeOnboarded: true }).where(eq(users.id, userId));
        return { alreadyOnboarded: true, accountId: user.stripeAccountId };
      }
      // Onboarding incomplete — generate a new link
      const link = await stripe.accountLinks.create({
        account: user.stripeAccountId,
        refresh_url: `${returnUrl}?stripe=refresh`,
        return_url: `${returnUrl}?stripe=complete`,
        type: "account_onboarding",
      });
      return { onboardingUrl: link.url, accountId: user.stripeAccountId };
    }
    return { alreadyOnboarded: true, accountId: user.stripeAccountId };
  }

  if (!stripe) {
    // Dev mode — fake it
    const fakeId = `acct_dev_${userId}`;
    await db.update(users).set({ stripeAccountId: fakeId, stripeOnboarded: true }).where(eq(users.id, userId));
    return { alreadyOnboarded: true, accountId: fakeId, devMode: true };
  }

  // Create new Express account
  const account = await stripe.accounts.create({
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
  const link = await stripe.accountLinks.create({
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

  if (!stripe) {
    return { connected: true, onboarded: true, devMode: true };
  }

  const account = await stripe.accounts.retrieve(user.stripeAccountId);
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

  const { platformFee, sellerPayout } = calculateFees(amount);

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

  if (stripe) {
    // Create PaymentIntent on OUR account (not the seller's)
    // Money comes to us first — we transfer to seller after delivery
    const paymentIntent = await stripe.paymentIntents.create({
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
    });

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
    stripeConfigured: !!stripe,
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
  if (tx.status !== "pending") throw new Error("Transaction already processed");

  if (stripe && tx.stripePaymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(tx.stripePaymentIntentId);
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
  if (tx.status !== "shipped") throw new Error("Not shipped yet");

  // Transfer seller's payout to their connected Stripe account
  if (stripe) {
    const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
    if (seller?.stripeAccountId) {
      const transfer = await stripe.transfers.create({
        amount: Math.round(tx.sellerPayout * 100), // cents
        currency: "usd",
        destination: seller.stripeAccountId,
        metadata: {
          transactionId: String(tx.id),
          bookId: String(tx.bookId),
        },
      });

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

  // Update stats
  const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
  if (seller) await db.update(users).set({ totalSales: (seller.totalSales || 0) + 1 }).where(eq(users.id, tx.sellerId));
  const [buyer] = await db.select().from(users).where(eq(users.id, tx.buyerId));
  if (buyer) await db.update(users).set({ totalPurchases: (buyer.totalPurchases || 0) + 1 }).where(eq(users.id, tx.buyerId));

  return { status: "completed" };
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
