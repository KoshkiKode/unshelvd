/**
 * Additional unit tests for server/payments.ts — covering the previously
 * untested functions and branches:
 *
 *   • getStripe       — instance caching and new-instance creation
 *   • isStripeEnabled — platform flag off / no key
 *   • calculateFees   — DB override, fallback, boundary & invalid values
 *   • createSellerAccount — user-not-found, dev mode, already-onboarded
 *   • checkSellerStatus   — user-not-found, no account, dev mode
 *   • confirmPayment      — Stripe PI verification (success + failure)
 *   • confirmDelivery     — PayPal capture path, Stripe transfer, concurrent
 *                           idempotency (updated = null)
 *   • refundPayment       — Stripe refund path, PayPal void path
 *   • adminReleaseToSeller — PayPal capture, Stripe transfer, seller-no-account
 *   • handleChargeRefunded — "completed" status skips book re-listing
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted db result queue ──────────────────────────────────────────────
const dbResults = vi.hoisted(() => [] as any[]);

// ─── hoisted Stripe mock factory ─────────────────────────────────────────
const stripeMock = vi.hoisted(() => ({
  paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
  transfers: { create: vi.fn() },
  refunds: { create: vi.fn() },
  accounts: { create: vi.fn(), retrieve: vi.fn() },
  accountLinks: { create: vi.fn() },
}));

// ─── hoisted platform-settings state ─────────────────────────────────────
const psState = vi.hoisted(() => ({
  stripeKey: null as string | null,
  stripeEnabled: true,
  platformFeePercent: null as string | null,
}));

// ─── mocks ───────────────────────────────────────────────────────────────

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
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  return { db: dbMock, storage: {}, DatabaseStorage: vi.fn() };
});

vi.mock("../../server/platform-settings", () => ({
  getSetting: vi.fn(async (key: string) => {
    if (key === "stripe_secret_key") return psState.stripeKey;
    if (key === "platform_fee_percent") return psState.platformFeePercent;
    return null;
  }),
  isEnabled: vi.fn(async () => psState.stripeEnabled),
}));

vi.mock("stripe", () => {
  // Must use a regular function (not arrow function) so `new Stripe(key)` works.
  // When a constructor returns an object, `new` returns that object.
  function StripeMock() {
    return stripeMock;
  }
  return { default: vi.fn().mockImplementation(StripeMock) };
});

vi.mock("../../server/paypal", () => ({
  capturePayPalAuthorization: vi.fn(),
  voidPayPalAuthorization: vi.fn().mockResolvedValue(undefined),
}));

import {
  getStripe,
  isStripeEnabled,
  calculateFees,
  createSellerAccount,
  checkSellerStatus,
  confirmPayment,
  confirmDelivery,
  refundPayment,
  adminReleaseToSeller,
  handleChargeRefunded,
  createPaymentIntent,
} from "../../server/payments";
import { db } from "../../server/storage";
import { capturePayPalAuthorization, voidPayPalAuthorization } from "../../server/paypal";

// ─── helpers ─────────────────────────────────────────────────────────────

// Use a unique key suffix per test to bust the module-level _stripeCache
let _keySeq = 0;
function freshStripeKey() {
  return `sk_test_${++_keySeq}`;
}

beforeEach(() => {
  dbResults.length = 0;
  vi.clearAllMocks();
  // Reset each stripe sub-mock individually to clear any unconsumed
  // mockResolvedValueOnce values that leaked from a failed previous test.
  stripeMock.paymentIntents.create.mockReset();
  stripeMock.paymentIntents.retrieve.mockReset();
  stripeMock.transfers.create.mockReset();
  stripeMock.refunds.create.mockReset();
  stripeMock.accounts.create.mockReset();
  stripeMock.accounts.retrieve.mockReset();
  stripeMock.accountLinks.create.mockReset();
  psState.stripeKey = null;
  psState.stripeEnabled = true;
  psState.platformFeePercent = null;
});

// ─────────────────────────────────────────────────────────────────────────
// getStripe — instance creation and caching
// ─────────────────────────────────────────────────────────────────────────

describe("getStripe", () => {
  it("returns null when no Stripe key is configured", async () => {
    psState.stripeKey = null;
    await expect(getStripe()).resolves.toBeNull();
  });

  it("creates a new Stripe instance when a key is provided", async () => {
    psState.stripeKey = freshStripeKey();
    const s = await getStripe();
    expect(s).toBeTruthy();
    const Stripe = (await import("stripe")).default;
    expect(vi.mocked(Stripe)).toHaveBeenCalledWith(psState.stripeKey);
  });

  it("returns the same cached instance on a second call with the same key", async () => {
    const key = freshStripeKey();
    psState.stripeKey = key;
    const s1 = await getStripe();
    const s2 = await getStripe();
    expect(s1).toBe(s2);
    const Stripe = (await import("stripe")).default;
    // Constructor should only be called once even though getStripe was called twice
    expect(vi.mocked(Stripe)).toHaveBeenCalledTimes(1);
  });

  it("creates a new instance when the key changes", async () => {
    psState.stripeKey = freshStripeKey();
    await getStripe();
    psState.stripeKey = freshStripeKey();
    await getStripe();

    const Stripe = (await import("stripe")).default;
    expect(vi.mocked(Stripe)).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// isStripeEnabled
// ─────────────────────────────────────────────────────────────────────────

describe("isStripeEnabled", () => {
  it("returns false when the stripe_enabled platform flag is false", async () => {
    psState.stripeEnabled = false;
    psState.stripeKey = freshStripeKey();
    await expect(isStripeEnabled()).resolves.toBe(false);
  });

  it("returns false when the flag is true but there is no Stripe key", async () => {
    psState.stripeEnabled = true;
    psState.stripeKey = null;
    await expect(isStripeEnabled()).resolves.toBe(false);
  });

  it("returns true when the flag is true and a key is configured", async () => {
    psState.stripeEnabled = true;
    psState.stripeKey = freshStripeKey();
    await expect(isStripeEnabled()).resolves.toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// calculateFees — DB override, fallback, and boundary values
// ─────────────────────────────────────────────────────────────────────────

describe("calculateFees", () => {
  it("uses the default 10% fee when no DB setting is present", async () => {
    psState.platformFeePercent = null;
    const { platformFee, sellerPayout } = await calculateFees(100);
    expect(platformFee).toBeCloseTo(10, 2);
    expect(sellerPayout).toBeCloseTo(90, 2);
  });

  it("uses the DB-configured fee when it is a valid percentage", async () => {
    psState.platformFeePercent = "15";
    const { platformFee, sellerPayout } = await calculateFees(100);
    expect(platformFee).toBeCloseTo(15, 2);
    expect(sellerPayout).toBeCloseTo(85, 2);
  });

  it("supports a 0% fee (free tier)", async () => {
    psState.platformFeePercent = "0";
    const { platformFee, sellerPayout } = await calculateFees(50);
    expect(platformFee).toBe(0);
    expect(sellerPayout).toBe(50);
  });

  it("falls back to default when the DB fee string is not a number", async () => {
    psState.platformFeePercent = "not_a_number";
    const { platformFee } = await calculateFees(100);
    expect(platformFee).toBeCloseTo(10, 2);
  });

  it("falls back to default when the DB fee is greater than 100", async () => {
    psState.platformFeePercent = "110";
    const { platformFee } = await calculateFees(100);
    expect(platformFee).toBeCloseTo(10, 2);
  });

  it("falls back to default when the DB fee is negative", async () => {
    psState.platformFeePercent = "-5";
    const { platformFee } = await calculateFees(100);
    expect(platformFee).toBeCloseTo(10, 2);
  });

  it("rounds fee and payout to two decimal places", async () => {
    psState.platformFeePercent = "10";
    const { platformFee, sellerPayout } = await calculateFees(33.33);
    expect(platformFee).toBe(3.33);
    expect(sellerPayout).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createSellerAccount
// ─────────────────────────────────────────────────────────────────────────

describe("createSellerAccount", () => {
  it("throws 'User not found' when the user does not exist", async () => {
    dbResults.push([]);  // db.select → no user
    await expect(createSellerAccount(99, "https://app.com/stripe")).rejects.toThrow(
      "User not found",
    );
  });

  it("returns dev-mode alreadyOnboarded when user has no account and Stripe is not configured", async () => {
    const user = { id: 1, email: "dev@example.com", username: "dev", stripeAccountId: null };
    dbResults.push([user]);    // db.select → user
    dbResults.push(undefined); // db.update (save fakeId)

    const result = await createSellerAccount(1, "https://app.com/stripe");
    expect(result).toMatchObject({ alreadyOnboarded: true, devMode: true });
    expect(result.accountId).toMatch(/^acct_dev_/);
  });

  it("returns alreadyOnboarded when user already has a stripeAccountId and Stripe is not configured", async () => {
    const user = {
      id: 2,
      email: "seller@example.com",
      username: "seller",
      stripeAccountId: "acct_existing",
    };
    dbResults.push([user]);  // db.select → user (no further db calls needed)

    const result = await createSellerAccount(2, "https://app.com/stripe");
    expect(result).toEqual({ alreadyOnboarded: true, accountId: "acct_existing" });
  });

  it("returns alreadyOnboarded when Stripe is configured and account details are submitted", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.accounts.retrieve.mockResolvedValueOnce({ details_submitted: true });

    const user = { id: 3, email: "pro@example.com", username: "pro", stripeAccountId: "acct_existing" };
    dbResults.push([user]);    // db.select → user (1st db call)
    dbResults.push(undefined); // db.update stripeOnboarded (2nd db call)

    const result = await createSellerAccount(3, "https://app.com/stripe");
    expect(result).toMatchObject({ alreadyOnboarded: true, accountId: "acct_existing" });
  });

  it("returns onboardingUrl when Stripe is configured and onboarding is incomplete", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.accounts.retrieve.mockResolvedValueOnce({ details_submitted: false });
    stripeMock.accountLinks.create.mockResolvedValueOnce({
      url: "https://connect.stripe.com/onboard/acct_existing",
    });

    const user = { id: 4, email: "new@example.com", username: "new", stripeAccountId: "acct_existing" };
    dbResults.push([user]);  // db.select → user (no db.update needed for this path)

    const result = await createSellerAccount(4, "https://app.com/stripe");
    expect(result).toMatchObject({
      onboardingUrl: "https://connect.stripe.com/onboard/acct_existing",
      accountId: "acct_existing",
    });
  });

  it("creates a new Stripe account and returns onboardingUrl when user has no existing account", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.accounts.create.mockResolvedValueOnce({ id: "acct_brand_new" });
    stripeMock.accountLinks.create.mockResolvedValueOnce({
      url: "https://connect.stripe.com/onboard/acct_brand_new",
    });

    const user = { id: 5, email: "fresh@example.com", username: "fresh", stripeAccountId: null };
    dbResults.push([user]);    // db.select → user (1st db call)
    dbResults.push(undefined); // db.update stripeAccountId (2nd db call)

    const result = await createSellerAccount(5, "https://app.com/stripe");
    expect(result).toMatchObject({
      onboardingUrl: "https://connect.stripe.com/onboard/acct_brand_new",
      accountId: "acct_brand_new",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// checkSellerStatus
// ─────────────────────────────────────────────────────────────────────────

describe("checkSellerStatus", () => {
  it("throws 'User not found' when the user does not exist", async () => {
    dbResults.push([]);  // db.select → no user
    await expect(checkSellerStatus(99)).rejects.toThrow("User not found");
  });

  it("returns connected=false when user has no stripeAccountId", async () => {
    const user = { id: 1, stripeAccountId: null, stripeOnboarded: false };
    dbResults.push([user]);  // db.select → user

    const result = await checkSellerStatus(1);
    expect(result).toEqual({ connected: false, onboarded: false });
  });

  it("returns devMode when Stripe is not configured but user has an account", async () => {
    const user = { id: 2, stripeAccountId: "acct_dev_2", stripeOnboarded: true };
    dbResults.push([user]);  // db.select → user

    const result = await checkSellerStatus(2);
    expect(result).toMatchObject({ connected: true, onboarded: true, devMode: true });
  });

  it("returns account status from Stripe when Stripe is configured", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.accounts.retrieve.mockResolvedValueOnce({
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    });

    const user = { id: 3, stripeAccountId: "acct_real", stripeOnboarded: false };
    dbResults.push([user]);    // db.select → user (1st db call)
    dbResults.push(undefined); // db.update stripeOnboarded (2nd db call)

    const result = await checkSellerStatus(3);
    expect(result).toMatchObject({
      connected: true,
      onboarded: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    });
  });

  it("does not update DB when stripeOnboarded is already true", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.accounts.retrieve.mockResolvedValueOnce({
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
    });

    const user = { id: 4, stripeAccountId: "acct_real", stripeOnboarded: true };
    dbResults.push([user]);  // db.select → user

    await checkSellerStatus(4);
    // db.update should NOT have been called (already flagged as onboarded)
    expect(vi.mocked(db).update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// confirmPayment — Stripe payment intent verification
// ─────────────────────────────────────────────────────────────────────────

describe("confirmPayment — with Stripe", () => {
  it("succeeds when Stripe confirms payment intent as 'succeeded'", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.paymentIntents.retrieve.mockResolvedValueOnce({ status: "succeeded" });

    const tx = { id: 1, buyerId: 10, status: "pending", stripePaymentIntentId: "pi_test" };
    dbResults.push([tx]);  // db.select → tx

    const result = await confirmPayment(1, 10);
    expect(result).toEqual({ status: "paid" });
    expect(stripeMock.paymentIntents.retrieve).toHaveBeenCalledWith("pi_test");
  });

  it("throws when Stripe payment intent status is not 'succeeded'", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.paymentIntents.retrieve.mockResolvedValueOnce({ status: "requires_payment_method" });

    const tx = { id: 1, buyerId: 10, status: "pending", stripePaymentIntentId: "pi_test" };
    dbResults.push([tx]);  // db.select → tx

    await expect(confirmPayment(1, 10)).rejects.toThrow("Payment not confirmed by Stripe");
  });

  it("skips Stripe verification when transaction has no stripePaymentIntentId", async () => {
    psState.stripeKey = freshStripeKey();

    const tx = { id: 2, buyerId: 10, status: "pending", stripePaymentIntentId: null };
    dbResults.push([tx]);  // db.select → tx

    const result = await confirmPayment(2, 10);
    expect(result).toEqual({ status: "paid" });
    expect(stripeMock.paymentIntents.retrieve).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// confirmDelivery — PayPal capture, Stripe transfer, concurrent idempotency
// ─────────────────────────────────────────────────────────────────────────

describe("confirmDelivery — extended paths", () => {
  it("captures PayPal authorization when transaction has paypalAuthorizationId", async () => {
    vi.mocked(capturePayPalAuthorization).mockResolvedValueOnce({
      captureId: "CAPTURE123",
      status: "COMPLETED",
    });

    const tx = {
      id: 1,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "shipped",
      sellerPayout: 18,
      paypalAuthorizationId: "AUTH123",
      paypalCaptureId: null,
      stripePaymentIntentId: null,
      stripeTransferId: null,
    };
    dbResults.push([tx]);                            // db.select → tx
    dbResults.push([{ ...tx, status: "completed" }]); // atomic status update

    const result = await confirmDelivery(1, 10);
    expect(result).toEqual({ status: "completed" });
    expect(vi.mocked(capturePayPalAuthorization)).toHaveBeenCalledWith("AUTH123");
  });

  it("issues a Stripe transfer to seller when Stripe is configured and seller has an account", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.transfers.create.mockResolvedValueOnce({ id: "tr_abc" });

    const tx = {
      id: 2,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "shipped",
      sellerPayout: 27,
      paypalAuthorizationId: null,
      stripePaymentIntentId: "pi_test",
      stripeTransferId: null,
    };
    const seller = { id: 20, stripeAccountId: "acct_seller" };
    dbResults.push([tx]);                             // db.select → tx
    dbResults.push([seller]);                         // db.select → seller
    dbResults.push([{ ...tx, status: "completed" }]); // atomic status update

    const result = await confirmDelivery(2, 10);
    expect(result).toEqual({ status: "completed" });
    expect(stripeMock.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ destination: "acct_seller" }),
      expect.objectContaining({ idempotencyKey: "transfer_2" }),
    );
  });

  it("skips the Stripe transfer when the seller has no connected account", async () => {
    psState.stripeKey = freshStripeKey();

    const tx = {
      id: 3,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "shipped",
      sellerPayout: 20,
      paypalAuthorizationId: null,
      stripePaymentIntentId: "pi_test",
      stripeTransferId: null,
    };
    const seller = { id: 20, stripeAccountId: null };
    dbResults.push([tx]);
    dbResults.push([seller]);
    dbResults.push([{ ...tx, status: "completed" }]);

    const result = await confirmDelivery(3, 10);
    expect(result).toEqual({ status: "completed" });
    expect(stripeMock.transfers.create).not.toHaveBeenCalled();
  });

  it("returns completed idempotently when a concurrent call already completed the transition", async () => {
    const tx = {
      id: 4,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "shipped",
      sellerPayout: 15,
      paypalAuthorizationId: null,
      stripePaymentIntentId: null,
      stripeTransferId: null,
    };
    dbResults.push([tx]);  // db.select → tx
    dbResults.push([]);    // atomic update returns empty → another caller won the race

    const result = await confirmDelivery(4, 10);
    expect(result).toEqual({ status: "completed" });
    // The sales/purchase counters should NOT have been incremented
    expect(vi.mocked(db).update).toHaveBeenCalledTimes(1); // only the atomic status update
  });
});

// ─────────────────────────────────────────────────────────────────────────
// refundPayment — Stripe refund path and PayPal void path
// ─────────────────────────────────────────────────────────────────────────

describe("refundPayment — Stripe and PayPal paths", () => {
  it("issues a Stripe refund for a paid transaction when Stripe is configured", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.refunds.create.mockResolvedValueOnce({ id: "re_test" });

    const tx = {
      id: 1,
      bookId: 5,
      status: "paid",
      stripePaymentIntentId: "pi_test",
      paypalAuthorizationId: null,
      paypalCaptureId: null,
    };
    dbResults.push([tx]);  // db.select → tx

    const result = await refundPayment(1);
    expect(result).toEqual({ status: "refunded" });
    expect(stripeMock.refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_test" }),
      expect.objectContaining({ idempotencyKey: "refund_1" }),
    );
  });

  it("does NOT issue a Stripe refund for a pending transaction (nothing captured yet)", async () => {
    psState.stripeKey = freshStripeKey();

    const tx = {
      id: 2,
      bookId: 5,
      status: "pending",
      stripePaymentIntentId: "pi_test",
      paypalAuthorizationId: null,
      paypalCaptureId: null,
    };
    dbResults.push([tx]);  // db.select → tx

    const result = await refundPayment(2);
    expect(result).toEqual({ status: "refunded" });
    // "pending" status skips the Stripe refund call
    expect(stripeMock.refunds.create).not.toHaveBeenCalled();
  });

  it("voids a PayPal authorization when present and not yet captured", async () => {
    const tx = {
      id: 3,
      bookId: 5,
      status: "paid",
      stripePaymentIntentId: null,
      paypalAuthorizationId: "AUTH456",
      paypalCaptureId: null,
    };
    dbResults.push([tx]);  // db.select → tx

    const result = await refundPayment(3);
    expect(result).toEqual({ status: "refunded" });
    expect(vi.mocked(voidPayPalAuthorization)).toHaveBeenCalledWith("AUTH456");
  });

  it("does NOT void PayPal when the authorization was already captured", async () => {
    const tx = {
      id: 4,
      bookId: 5,
      status: "shipped",
      stripePaymentIntentId: null,
      paypalAuthorizationId: "AUTH789",
      paypalCaptureId: "CAP789",
    };
    dbResults.push([tx]);  // db.select → tx

    const result = await refundPayment(4);
    expect(result).toEqual({ status: "refunded" });
    expect(vi.mocked(voidPayPalAuthorization)).not.toHaveBeenCalled();
  });

  it("catches and logs (but does not rethrow) a PayPal void error", async () => {
    vi.mocked(voidPayPalAuthorization).mockRejectedValueOnce(new Error("PayPal void failed"));

    const tx = {
      id: 5,
      bookId: 5,
      status: "paid",
      stripePaymentIntentId: null,
      paypalAuthorizationId: "AUTH_ERR",
      paypalCaptureId: null,
    };
    dbResults.push([tx]);  // db.select → tx

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await refundPayment(5);
    expect(result).toEqual({ status: "refunded" });
    expect(errSpy).toHaveBeenCalledWith(
      "[refund] PayPal void authorization failed:",
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// adminReleaseToSeller — PayPal capture path, seller-no-account error
// ─────────────────────────────────────────────────────────────────────────

describe("adminReleaseToSeller — extended paths", () => {
  it("captures PayPal authorization when transaction has paypalAuthorizationId and no captureId", async () => {
    vi.mocked(capturePayPalAuthorization).mockResolvedValueOnce({
      captureId: "CAP_RELEASE",
      status: "COMPLETED",
    });

    const tx = {
      id: 1,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "disputed",
      sellerPayout: 20,
      paypalAuthorizationId: "AUTH_RELEASE",
      paypalCaptureId: null,
      stripePaymentIntentId: null,
      stripeTransferId: null,
    };
    dbResults.push([tx]);  // db.select → tx

    const result = await adminReleaseToSeller(1);
    expect(result).toEqual({ status: "completed" });
    expect(vi.mocked(capturePayPalAuthorization)).toHaveBeenCalledWith("AUTH_RELEASE");
  });

  it("issues a Stripe transfer when Stripe is configured and seller has a connected account", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.transfers.create.mockResolvedValueOnce({ id: "tr_dispute_release" });

    const tx = {
      id: 2,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "disputed",
      sellerPayout: 45,
      paypalAuthorizationId: null,
      paypalCaptureId: null,
      stripePaymentIntentId: "pi_dispute",
      stripeTransferId: null,
    };
    const seller = { id: 20, stripeAccountId: "acct_seller" };
    dbResults.push([tx]);      // db.select → tx
    dbResults.push([seller]);  // db.select → seller

    const result = await adminReleaseToSeller(2);
    expect(result).toEqual({ status: "completed" });
    expect(stripeMock.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ destination: "acct_seller" }),
      expect.objectContaining({ idempotencyKey: "transfer_dispute_2" }),
    );
  });

  it("throws when Stripe is configured but the seller has no connected account", async () => {
    psState.stripeKey = freshStripeKey();

    const tx = {
      id: 3,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "disputed",
      sellerPayout: 30,
      paypalAuthorizationId: null,
      paypalCaptureId: null,
      stripePaymentIntentId: "pi_dispute",
      stripeTransferId: null,
    };
    const seller = { id: 20, stripeAccountId: null };
    dbResults.push([tx]);      // db.select → tx
    dbResults.push([seller]);  // db.select → seller

    await expect(adminReleaseToSeller(3)).rejects.toThrow(
      /does not have a connected Stripe account/i,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// handleChargeRefunded — "completed" status skips book re-listing
// ─────────────────────────────────────────────────────────────────────────

describe("handleChargeRefunded — completed status path", () => {
  it("does not re-list the book when the transaction was already completed (post-delivery chargeback)", async () => {
    const completedTx = {
      id: 1,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "completed",
      stripePaymentIntentId: "pi_test",
    };
    dbResults.push([completedTx]);  // db.select → tx

    await handleChargeRefunded("pi_test");

    // The transaction should be marked refunded (one db.update call)
    expect(vi.mocked(db).update).toHaveBeenCalledTimes(1);
    // But the book should NOT be re-listed (it's already been delivered)
    const setCalls = vi.mocked(db).set.mock.calls as any[][];
    const bookRelistCall = setCalls.find(
      (args) => args[0] && typeof args[0] === "object" && args[0].status === "for-sale",
    );
    expect(bookRelistCall).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// checkSellerStatus — details_submitted falsy branch (line 158)
// ─────────────────────────────────────────────────────────────────────────

describe("checkSellerStatus — details_submitted falsy branch", () => {
  it("treats onboarded as false when details_submitted is undefined in the Stripe response", async () => {
    psState.stripeKey = freshStripeKey();
    // Return account with no details_submitted field → || false fires
    stripeMock.accounts.retrieve.mockResolvedValueOnce({
      charges_enabled: false,
      payouts_enabled: false,
      // details_submitted intentionally omitted → undefined → || false
    });

    const user = { id: 5, stripeAccountId: "acct_partial", stripeOnboarded: false };
    dbResults.push([user]);  // db.select → user (no db.update since onboarded=false)

    const result = await checkSellerStatus(5);
    expect(result).toMatchObject({ connected: true, onboarded: false });
    // DB update should NOT have been called (onboarded is false)
    expect(vi.mocked(db).update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createPaymentIntent — race condition (book grabbed by concurrent buyer)
// ─────────────────────────────────────────────────────────────────────────

describe("createPaymentIntent — concurrent purchase race condition", () => {
  it("throws 'Book is no longer available' when the atomic lock update returns empty", async () => {
    const book = {
      id: 10,
      userId: 5,
      status: "for-sale",
      price: 30.0,
      title: "Popular Book",
      author: "Author",
      coverUrl: null,
    };

    dbResults.push([book]); // initial select check — book is for-sale
    dbResults.push([]);     // atomic update returns empty → another buyer won the race

    await expect(createPaymentIntent(1, 10)).rejects.toThrow(
      "Book is no longer available for purchase",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// confirmDelivery — idempotent early return (tx already completed)
// ─────────────────────────────────────────────────────────────────────────

describe("confirmDelivery — already-completed idempotent early return", () => {
  it("returns completed immediately when the transaction is already in completed status", async () => {
    const tx = {
      id: 1,
      buyerId: 10,
      sellerId: 20,
      bookId: 5,
      status: "completed",
      sellerPayout: 20,
      paypalAuthorizationId: null,
      stripePaymentIntentId: null,
      stripeTransferId: null,
    };
    dbResults.push([tx]);  // db.select → already-completed tx

    const result = await confirmDelivery(1, 10);
    expect(result).toEqual({ status: "completed" });
    // No further db updates should happen — idempotent early return
    expect(vi.mocked(db).update).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// createPaymentIntent — Stripe path (success and error recovery)
// ─────────────────────────────────────────────────────────────────────────

describe("createPaymentIntent — with Stripe configured", () => {
  it("creates a Stripe PaymentIntent and saves its ID when Stripe is configured", async () => {
    psState.stripeKey = freshStripeKey();
    stripeMock.paymentIntents.create.mockResolvedValueOnce({
      id: "pi_new",
      client_secret: "pi_new_secret",
    });

    const book = {
      id: 10,
      userId: 5,
      status: "for-sale",
      price: 25.0,
      title: "Stripe Book",
      author: "Author",
      coverUrl: null,
    };
    const lockedBook = { ...book, status: "not-for-sale" };
    const seller = { id: 5, displayName: "Seller", username: "seller" };
    const newTx = { id: 99 };

    dbResults.push([book]);      // initial select check
    dbResults.push([lockedBook]); // atomic update lock
    dbResults.push([seller]);     // seller lookup
    dbResults.push([newTx]);      // insert transaction

    const result = await createPaymentIntent(1, 10);
    expect(result.clientSecret).toBe("pi_new_secret");
    expect(stripeMock.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2500, currency: "usd" }),
      expect.objectContaining({ idempotencyKey: "checkout_99" }),
    );
  });

  it("rolls back the book lock and deletes the transaction when Stripe API fails", async () => {
    psState.stripeKey = freshStripeKey();
    const stripeErr = new Error("Stripe API error");
    stripeMock.paymentIntents.create.mockRejectedValueOnce(stripeErr);

    const book = {
      id: 10,
      userId: 5,
      status: "for-sale",
      price: 20.0,
      title: "Book",
      author: "Author",
      coverUrl: null,
    };
    const lockedBook = { ...book, status: "not-for-sale" };
    const seller = { id: 5, displayName: "Seller", username: "seller" };
    const newTx = { id: 100 };

    dbResults.push([book]);       // initial select check
    dbResults.push([lockedBook]); // atomic update lock
    dbResults.push([seller]);     // seller lookup
    dbResults.push([newTx]);      // insert transaction

    await expect(createPaymentIntent(1, 10)).rejects.toThrow("Stripe API error");

    // The book status should have been reset and the transaction deleted
    expect(vi.mocked(db).update).toHaveBeenCalled();
    expect(vi.mocked(db).delete).toHaveBeenCalled();
  });
});

