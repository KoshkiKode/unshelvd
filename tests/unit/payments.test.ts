import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted queue for db call results ─────────────────────────────────────
const dbResults = vi.hoisted(() => [] as any[]);

// ─── mock the storage module (same pattern as work-resolver tests) ──────────
vi.mock("../../server/storage", () => {
  const dbMock = {
    then(resolve: (v: any) => void, reject: (r?: any) => void) {
      const value = dbResults.length > 0 ? dbResults.shift() : [];
      return Promise.resolve(value).then(resolve, reject);
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return { db: dbMock, storage: {}, DatabaseStorage: vi.fn() };
});

// No STRIPE_SECRET_KEY in tests → stripe will be null (no real API calls)
import {
  confirmPayment,
  handleChargeRefunded,
  createPaymentIntent,
  markShipped,
  confirmDelivery,
  failPayment,
  handleSellerAccountUpdated,
  handleTransferFailed,
  refundPayment,
  getUserTransactions,
} from "../../server/payments";
import { db } from "../../server/storage";

// ──────────────────────────────────────────────────────────────────────────
// confirmPayment — idempotency
// ──────────────────────────────────────────────────────────────────────────

describe("confirmPayment — idempotency", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns { status: 'paid' } immediately when transaction is already paid", async () => {
    const alreadyPaidTx = {
      id: 1,
      buyerId: 42,
      sellerId: 7,
      bookId: 100,
      status: "paid",
      stripePaymentIntentId: "pi_test",
    };
    dbResults.push([alreadyPaidTx]); // first db.select() call

    const result = await confirmPayment(1, 42);

    expect(result).toEqual({ status: "paid" });
    // db.update should NOT have been called — no state change on re-confirmation
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("throws 'Not your transaction' when buyerId does not match", async () => {
    const tx = { id: 1, buyerId: 99, status: "pending", stripePaymentIntentId: null };
    dbResults.push([tx]);

    await expect(confirmPayment(1, 42)).rejects.toThrow("Not your transaction");
  });

  it("throws 'Transaction not found' when no transaction exists", async () => {
    dbResults.push([]); // empty result

    await expect(confirmPayment(999, 42)).rejects.toThrow("Transaction not found");
  });

  it("throws 'Transaction already processed' for non-pending, non-paid statuses", async () => {
    const tx = { id: 1, buyerId: 42, status: "completed", stripePaymentIntentId: null };
    dbResults.push([tx]);

    await expect(confirmPayment(1, 42)).rejects.toThrow("Transaction already processed");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// handleChargeRefunded — already-refunded guard
// ──────────────────────────────────────────────────────────────────────────

describe("handleChargeRefunded — already-refunded guard", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns without making any DB updates when transaction is already refunded", async () => {
    const alreadyRefundedTx = {
      id: 1,
      buyerId: 42,
      sellerId: 7,
      bookId: 100,
      status: "refunded",
      stripePaymentIntentId: "pi_test",
    };
    dbResults.push([alreadyRefundedTx]); // first db.select() call

    await handleChargeRefunded("pi_test");

    // db.update should NOT have been called — already refunded
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("returns without error when no matching transaction is found", async () => {
    dbResults.push([]); // no transaction matches the payment_intent

    await expect(handleChargeRefunded("pi_unknown")).resolves.toBeUndefined();
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("calls db.update when transaction needs to be marked refunded", async () => {
    const paidTx = {
      id: 1,
      buyerId: 42,
      sellerId: 7,
      bookId: 100,
      status: "paid",
      stripePaymentIntentId: "pi_test",
    };
    dbResults.push([paidTx]); // db.select returns the transaction
    // db.update().set().where() for transactions → no explicit return needed
    dbResults.push(undefined);
    // db.update().set().where() for books
    dbResults.push(undefined);

    await handleChargeRefunded("pi_test");

    expect((db as any).update).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// createPaymentIntent — validation & success (no Stripe key in tests)
// ──────────────────────────────────────────────────────────────────────────

describe("createPaymentIntent — validation", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("throws 'Book not found' when the book does not exist", async () => {
    dbResults.push([]); // db.select from books → empty
    await expect(createPaymentIntent(1, 99)).rejects.toThrow("Book not found");
  });

  it("throws 'Cannot buy your own book' when buyer is the seller", async () => {
    const book = { id: 10, userId: 1, status: "for-sale", price: 15.0 };
    dbResults.push([book]); // db.select from books
    await expect(createPaymentIntent(1, 10)).rejects.toThrow("Cannot buy your own book");
  });

  it("throws 'Book is not for sale' when status is not-for-sale", async () => {
    const book = { id: 10, userId: 5, status: "not-for-sale", price: 15.0 };
    dbResults.push([book]);
    await expect(createPaymentIntent(1, 10)).rejects.toThrow("Book is not for sale");
  });

  it("throws 'Book has no price set' when price is null", async () => {
    const book = { id: 10, userId: 5, status: "for-sale", price: null };
    dbResults.push([book]);
    await expect(createPaymentIntent(1, 10)).rejects.toThrow("Book has no price set");
  });

  it("throws 'Book has no price set' when price is 0", async () => {
    const book = { id: 10, userId: 5, status: "for-sale", price: 0 };
    dbResults.push([book]);
    await expect(createPaymentIntent(1, 10)).rejects.toThrow("Book has no price set");
  });

  it("throws 'Seller not found' when seller user does not exist", async () => {
    const book = { id: 10, userId: 5, status: "for-sale", price: 20.0 };
    dbResults.push([book]);  // books select
    dbResults.push([]);       // users select → no seller
    await expect(createPaymentIntent(1, 10)).rejects.toThrow("Seller not found");
  });

  it("returns transaction details when everything is valid (dev mode, no stripe)", async () => {
    const book = {
      id: 10,
      userId: 5,
      status: "for-sale",
      price: 20.0,
      title: "Dune",
      author: "Frank Herbert",
      coverUrl: null,
    };
    const seller = { id: 5, displayName: "Bob", username: "bob" };
    const transaction = {
      id: 77,
      buyerId: 1,
      sellerId: 5,
      bookId: 10,
      amount: 20.0,
      platformFee: 2.0,
      sellerPayout: 18.0,
      status: "pending",
    };

    dbResults.push([book]);        // books select
    dbResults.push([seller]);      // users select (seller)
    dbResults.push([transaction]); // insert transactions returning

    const result = await createPaymentIntent(1, 10);

    expect(result.transactionId).toBe(77);
    expect(result.clientSecret).toBeNull(); // no stripe
    expect(result.amount).toBe(20.0);
    expect(result.stripeConfigured).toBe(false);
    expect(result.book.title).toBe("Dune");
    expect(result.seller.username).toBe("bob");
  });

  it("accepts open-to-offers books as purchasable", async () => {
    const book = {
      id: 11,
      userId: 5,
      status: "open-to-offers",
      price: 10.0,
      title: "1984",
      author: "Orwell",
      coverUrl: null,
    };
    const seller = { id: 5, displayName: "Seller", username: "seller" };
    const transaction = { id: 88, buyerId: 2, sellerId: 5, bookId: 11, amount: 10.0, platformFee: 1.0, sellerPayout: 9.0 };

    dbResults.push([book]);
    dbResults.push([seller]);
    dbResults.push([transaction]);

    const result = await createPaymentIntent(2, 11, 3);
    expect(result.transactionId).toBe(88);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// markShipped — validation & success
// ──────────────────────────────────────────────────────────────────────────

describe("markShipped", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("throws 'Transaction not found' when no transaction exists", async () => {
    dbResults.push([]);
    await expect(markShipped(1, 5)).rejects.toThrow("Transaction not found");
  });

  it("throws 'Not your sale' when userId is not the seller", async () => {
    const tx = { id: 1, sellerId: 99, status: "paid" };
    dbResults.push([tx]);
    await expect(markShipped(1, 5)).rejects.toThrow("Not your sale");
  });

  it("throws 'Payment not confirmed yet' when status is not paid", async () => {
    const tx = { id: 1, sellerId: 5, status: "pending" };
    dbResults.push([tx]);
    await expect(markShipped(1, 5)).rejects.toThrow("Payment not confirmed yet");
  });

  it("returns { status: 'shipped' } on success", async () => {
    const tx = { id: 1, sellerId: 5, status: "paid" };
    dbResults.push([tx]);  // select transaction
    dbResults.push(undefined); // update transaction

    const result = await markShipped(1, 5, "USPS", "9400111899220400000000");
    expect(result).toEqual({ status: "shipped" });
    expect((db as any).update).toHaveBeenCalledTimes(1);
  });

  it("succeeds without carrier or tracking", async () => {
    const tx = { id: 2, sellerId: 7, status: "paid" };
    dbResults.push([tx]);
    dbResults.push(undefined);

    const result = await markShipped(2, 7);
    expect(result).toEqual({ status: "shipped" });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// confirmDelivery — validation & success (no Stripe key in tests)
// ──────────────────────────────────────────────────────────────────────────

describe("confirmDelivery", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("throws 'Transaction not found' when no transaction exists", async () => {
    dbResults.push([]);
    await expect(confirmDelivery(1, 5)).rejects.toThrow("Transaction not found");
  });

  it("throws 'Not your purchase' when userId is not the buyer", async () => {
    const tx = { id: 1, buyerId: 99, sellerId: 5, status: "shipped" };
    dbResults.push([tx]);
    await expect(confirmDelivery(1, 5)).rejects.toThrow("Not your purchase");
  });

  it("throws 'Not shipped yet' when status is not shipped", async () => {
    const tx = { id: 1, buyerId: 5, sellerId: 7, status: "paid" };
    dbResults.push([tx]);
    await expect(confirmDelivery(1, 5)).rejects.toThrow("Not shipped yet");
  });

  it("returns { status: 'completed' } and updates buyer/seller stats on success", async () => {
    const tx = { id: 1, buyerId: 5, sellerId: 7, bookId: 100, sellerPayout: 18.0, status: "shipped", stripeTransferId: null };

    dbResults.push([tx]);       // select transaction
    dbResults.push(undefined);  // update transaction → completed
    dbResults.push(undefined);  // atomic update seller totalSales
    dbResults.push(undefined);  // atomic update buyer totalPurchases

    const result = await confirmDelivery(1, 5);
    expect(result).toEqual({ status: "completed" });
    expect((db as any).update).toHaveBeenCalledTimes(3); // tx + seller + buyer
  });

  it("always issues atomic stat increments (no conditional select needed)", async () => {
    const tx = { id: 2, buyerId: 5, sellerId: 7, bookId: 101, sellerPayout: 9.0, status: "shipped", stripeTransferId: null };

    dbResults.push([tx]);       // select transaction
    dbResults.push(undefined);  // update transaction → completed
    dbResults.push(undefined);  // atomic update seller totalSales (safe even if user missing)
    dbResults.push(undefined);  // atomic update buyer totalPurchases (safe even if user missing)

    const result = await confirmDelivery(2, 5);
    expect(result).toEqual({ status: "completed" });
    // All three updates must always be issued — no read-before-write guarding
    expect((db as any).update).toHaveBeenCalledTimes(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// failPayment — no-op guards & success
// ──────────────────────────────────────────────────────────────────────────

describe("failPayment", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns without any DB writes when no transaction matches the payment intent", async () => {
    dbResults.push([]); // select → empty
    await failPayment("pi_unknown");
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("returns without any DB writes when the transaction is not pending", async () => {
    const tx = { id: 1, bookId: 10, status: "paid", stripePaymentIntentId: "pi_test" };
    dbResults.push([tx]);
    await failPayment("pi_test");
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("marks the transaction failed and re-opens the book when status is pending", async () => {
    const tx = { id: 1, bookId: 10, status: "pending", stripePaymentIntentId: "pi_test" };
    dbResults.push([tx]);       // select transaction
    dbResults.push(undefined);  // update transaction → failed
    dbResults.push(undefined);  // update book → for-sale

    await failPayment("pi_test");
    expect((db as any).update).toHaveBeenCalledTimes(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// handleSellerAccountUpdated — conditional DB write
// ──────────────────────────────────────────────────────────────────────────

describe("handleSellerAccountUpdated", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("updates stripeOnboarded when details_submitted and charges_enabled are both true", async () => {
    dbResults.push(undefined); // update users

    await handleSellerAccountUpdated("acct_123", true, true);
    expect((db as any).update).toHaveBeenCalledTimes(1);
  });

  it("does NOT update when details_submitted is false", async () => {
    await handleSellerAccountUpdated("acct_123", false, true);
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("does NOT update when charges_enabled is false", async () => {
    await handleSellerAccountUpdated("acct_123", true, false);
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("does NOT update when both flags are false", async () => {
    await handleSellerAccountUpdated("acct_123", false, false);
    expect((db as any).update).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// handleTransferFailed — no-op guard & success
// ──────────────────────────────────────────────────────────────────────────

describe("handleTransferFailed", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns without any DB writes when no transaction matches the transfer id", async () => {
    dbResults.push([]); // select → empty
    await handleTransferFailed("tr_unknown");
    expect((db as any).update).not.toHaveBeenCalled();
  });

  it("marks the transaction as disputed when a matching transaction is found", async () => {
    const tx = { id: 5, stripeTransferId: "tr_abc", status: "completed" };
    dbResults.push([tx]);      // select transaction
    dbResults.push(undefined); // update transaction → disputed

    await handleTransferFailed("tr_abc");
    expect((db as any).update).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// refundPayment — validation & success (no Stripe key in tests)
// ──────────────────────────────────────────────────────────────────────────

describe("refundPayment", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("throws 'Transaction not found' when no transaction exists", async () => {
    dbResults.push([]);
    await expect(refundPayment(1)).rejects.toThrow("Transaction not found");
  });

  it("throws when transaction status is 'completed' (not refundable)", async () => {
    const tx = { id: 1, bookId: 10, status: "completed", stripePaymentIntentId: null };
    dbResults.push([tx]);
    await expect(refundPayment(1)).rejects.toThrow(/Cannot refund/);
  });

  it("throws when transaction status is 'disputed'", async () => {
    const tx = { id: 1, bookId: 10, status: "disputed", stripePaymentIntentId: null };
    dbResults.push([tx]);
    await expect(refundPayment(1)).rejects.toThrow(/Cannot refund/);
  });

  it("returns { status: 'refunded' } and re-lists book for a pending transaction", async () => {
    const tx = { id: 1, bookId: 10, status: "pending", stripePaymentIntentId: null };
    dbResults.push([tx]);       // select transaction
    dbResults.push(undefined);  // update transaction → refunded
    dbResults.push(undefined);  // update book → for-sale

    const result = await refundPayment(1);
    expect(result).toEqual({ status: "refunded" });
    expect((db as any).update).toHaveBeenCalledTimes(2);
  });

  it("returns { status: 'refunded' } for a paid transaction (no stripe)", async () => {
    const tx = { id: 2, bookId: 20, status: "paid", stripePaymentIntentId: "pi_test" };
    // stripe is null in tests → no stripe.refunds.create call
    dbResults.push([tx]);
    dbResults.push(undefined);
    dbResults.push(undefined);

    const result = await refundPayment(2);
    expect(result).toEqual({ status: "refunded" });
  });

  it("returns { status: 'refunded' } for a shipped transaction (no stripe)", async () => {
    const tx = { id: 3, bookId: 30, status: "shipped", stripePaymentIntentId: null };
    dbResults.push([tx]);
    dbResults.push(undefined);
    dbResults.push(undefined);

    const result = await refundPayment(3);
    expect(result).toEqual({ status: "refunded" });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// getUserTransactions — purchases and sales
// ──────────────────────────────────────────────────────────────────────────

describe("getUserTransactions", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns empty purchases and sales arrays when there are no transactions", async () => {
    dbResults.push([]); // purchases select
    dbResults.push([]); // sales select

    const result = await getUserTransactions(1);
    expect(result).toEqual({ purchases: [], sales: [] });
  });

  it("returns enriched purchases with book, buyer, and seller info", async () => {
    const purchase = {
      id: 10,
      buyerId: 1,
      sellerId: 5,
      bookId: 100,
      amount: 20.0,
      status: "completed",
    };
    const sale = {
      id: 11,
      buyerId: 3,
      sellerId: 1,
      bookId: 200,
      amount: 30.0,
      status: "shipped",
    };
    const book1 = { id: 100, title: "Dune", author: "Herbert", coverUrl: null };
    const buyer1 = { id: 1, displayName: "Alice", username: "alice" };
    const seller1 = { id: 5, displayName: "Bob", username: "bob" };
    const book2 = { id: 200, title: "1984", author: "Orwell", coverUrl: null };
    const buyer2 = { id: 3, displayName: "Carol", username: "carol" };
    const seller2 = { id: 1, displayName: "Alice", username: "alice" };

    // purchases select, sales select, then enrich each:
    // For purchase: book + buyer + seller
    // For sale: book + buyer + seller
    dbResults.push([purchase]);  // purchases query
    dbResults.push([sale]);      // sales query
    dbResults.push([book1]);     // enrich purchase: book
    dbResults.push([buyer1]);    // enrich purchase: buyer
    dbResults.push([seller1]);   // enrich purchase: seller
    dbResults.push([book2]);     // enrich sale: book
    dbResults.push([buyer2]);    // enrich sale: buyer
    dbResults.push([seller2]);   // enrich sale: seller

    const result = await getUserTransactions(1);

    expect(result.purchases).toHaveLength(1);
    expect(result.purchases[0].book?.title).toBe("Dune");
    expect(result.purchases[0].buyer?.username).toBe("alice");
    expect(result.purchases[0].seller?.username).toBe("bob");

    expect(result.sales).toHaveLength(1);
    expect(result.sales[0].book?.title).toBe("1984");
    expect(result.sales[0].buyer?.username).toBe("carol");
    expect(result.sales[0].seller?.username).toBe("alice");
  });

  it("returns null book/buyer/seller when enrichment finds no matching record", async () => {
    const purchase = { id: 10, buyerId: 1, sellerId: 5, bookId: 999, amount: 20.0, status: "pending" };

    dbResults.push([purchase]); // purchases
    dbResults.push([]);         // sales
    dbResults.push([]);         // enrich purchase: book → not found
    dbResults.push([]);         // enrich purchase: buyer → not found
    dbResults.push([]);         // enrich purchase: seller → not found

    const result = await getUserTransactions(1);
    expect(result.purchases[0].book).toBeNull();
    expect(result.purchases[0].buyer).toBeNull();
    expect(result.purchases[0].seller).toBeNull();
  });
});
