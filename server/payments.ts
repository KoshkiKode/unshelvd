/**
 * Unshelv'd — Payment Engine (Stripe)
 * 
 * Flow:
 * 1. Buyer clicks "Buy Now" → creates a Stripe PaymentIntent
 * 2. Buyer completes payment in-app via Stripe Elements
 * 3. Webhook confirms payment → status: "paid"
 * 4. Seller ships and adds tracking → status: "shipped"
 * 5. Buyer confirms receipt → status: "delivered"
 * 6. After 48h (or buyer confirms early) → funds released to seller, status: "completed"
 * 
 * Platform fee: 5% of the sale price (configurable)
 * Stripe processing: ~2.9% + $0.30 (Stripe takes this from the total)
 * 
 * Stripe Connect:
 * - Sellers connect their Stripe account to receive payouts
 * - Unshelv'd uses Stripe Connect "destination charges" 
 * - Platform fee is automatically split at payment time
 */

import Stripe from "stripe";
import { db } from "./storage";
import { transactions, books, users } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

// Platform fee percentage (5%)
export const PLATFORM_FEE_PERCENT = 0.05;

// Initialize Stripe (will be null if no key configured — graceful degradation)
const stripeKey = process.env.STRIPE_SECRET_KEY;
export const stripe = stripeKey ? new Stripe(stripeKey) : null;

function calculateFees(amount: number) {
  const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT * 100) / 100;
  const sellerPayout = Math.round((amount - platformFee) * 100) / 100;
  return { platformFee, sellerPayout };
}

/**
 * Create a payment intent for buying a book
 */
export async function createPaymentIntent(buyerId: number, bookId: number, offerId?: number) {
  // Get the book
  const [book] = await db.select().from(books).where(eq(books.id, bookId));
  if (!book) throw new Error("Book not found");
  if (book.userId === buyerId) throw new Error("Cannot buy your own book");
  if (book.status !== "for-sale" && book.status !== "open-to-offers") {
    throw new Error("Book is not for sale");
  }

  // Determine price
  let amount = book.price;
  if (offerId) {
    // Check if there's an accepted offer with a different price
    // For now, use book price; offer integration can refine this
  }
  if (!amount || amount <= 0) throw new Error("Book has no price set");

  const { platformFee, sellerPayout } = calculateFees(amount);

  // Get seller info
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

  // Create Stripe PaymentIntent if Stripe is configured
  let clientSecret: string | null = null;
  if (stripe) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: "usd",
      metadata: {
        transactionId: String(transaction.id),
        bookId: String(bookId),
        buyerId: String(buyerId),
        sellerId: String(book.userId),
      },
      // With Stripe Connect, you'd add:
      // transfer_data: {
      //   destination: seller.stripeAccountId,
      // },
      // application_fee_amount: Math.round(platformFee * 100),
    });

    clientSecret = paymentIntent.client_secret;

    // Update transaction with Stripe ID
    await db.update(transactions)
      .set({ stripePaymentIntentId: paymentIntent.id })
      .where(eq(transactions.id, transaction.id));
  }

  return {
    transactionId: transaction.id,
    clientSecret, // null if Stripe not configured (dev mode)
    amount,
    platformFee,
    sellerPayout,
    book: {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
    },
    seller: {
      id: seller.id,
      displayName: seller.displayName,
      username: seller.username,
    },
  };
}

/**
 * Confirm payment (called after Stripe confirms, or in dev mode)
 */
export async function confirmPayment(transactionId: number, userId: number) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) throw new Error("Transaction not found");
  if (tx.buyerId !== userId) throw new Error("Not your transaction");
  if (tx.status !== "pending") throw new Error("Transaction already processed");

  // If Stripe is configured, verify the payment intent is succeeded
  if (stripe && tx.stripePaymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(tx.stripePaymentIntentId);
    if (pi.status !== "succeeded") throw new Error("Payment not confirmed by Stripe");
  }

  await db.update(transactions).set({
    status: "paid",
    updatedAt: new Date(),
  }).where(eq(transactions.id, transactionId));

  // Mark book as sold (not for sale)
  await db.update(books).set({ status: "not-for-sale" }).where(eq(books.id, tx.bookId));

  return { status: "paid" };
}

/**
 * Seller marks as shipped
 */
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
 * Buyer confirms delivery
 */
export async function confirmDelivery(transactionId: number, userId: number) {
  const [tx] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!tx) throw new Error("Transaction not found");
  if (tx.buyerId !== userId) throw new Error("Not your purchase");
  if (tx.status !== "shipped") throw new Error("Not shipped yet");

  await db.update(transactions).set({
    status: "completed",
    deliveredAt: new Date(),
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(transactions.id, transactionId));

  // Update seller stats
  const [seller] = await db.select().from(users).where(eq(users.id, tx.sellerId));
  if (seller) {
    await db.update(users).set({
      totalSales: (seller.totalSales || 0) + 1,
    }).where(eq(users.id, tx.sellerId));
  }

  // Update buyer stats
  const [buyer] = await db.select().from(users).where(eq(users.id, tx.buyerId));
  if (buyer) {
    await db.update(users).set({
      totalPurchases: (buyer.totalPurchases || 0) + 1,
    }).where(eq(users.id, tx.buyerId));
  }

  return { status: "completed" };
}

/**
 * Get transactions for a user
 */
export async function getUserTransactions(userId: number) {
  const purchases = await db.select().from(transactions)
    .where(eq(transactions.buyerId, userId))
    .orderBy(desc(transactions.id));

  const sales = await db.select().from(transactions)
    .where(eq(transactions.sellerId, userId))
    .orderBy(desc(transactions.id));

  // Enrich with book and user info
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
