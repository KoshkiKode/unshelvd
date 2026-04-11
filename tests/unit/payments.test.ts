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
import { confirmPayment, handleChargeRefunded } from "../../server/payments";
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
