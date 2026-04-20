/**
 * Unit tests for server/jobs.ts
 *
 * pool, db, payments.confirmDelivery, and email helpers are fully mocked so
 * no real PostgreSQL connection or external service is required.
 *
 * Because the three background job functions are unexported they are
 * exercised indirectly through startJobs().  We flush the promise queue
 * with setImmediate so that fire-and-forget job promises settle before
 * asserting on side effects.
 *
 * Lock IDs mirror the unexported constants in jobs.ts:
 *   LOCK_AUTO_COMPLETE = 8301
 *   LOCK_EXPIRE_OFFERS = 8302
 *   LOCK_EXPIRE_PENDING = 8303
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted db result queue ───────────────────────────────────────────────
const dbResults = vi.hoisted(() => [] as any[]);

// ── Hoisted pool client mock ──────────────────────────────────────────────
const clientMock = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

// ── Hoisted pool mock ─────────────────────────────────────────────────────
const poolMock = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../../server/storage", () => {
  const dbMock = {
    then(resolve: (v: any) => void, reject: (r?: any) => void) {
      const value = dbResults.length > 0 ? dbResults.shift() : [];
      return Promise.resolve(value).then(resolve, reject);
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
  };

  return {
    pool: poolMock,
    db: dbMock,
    storage: {},
    DatabaseStorage: vi.fn(),
  };
});

vi.mock("../../server/payments", () => ({
  confirmDelivery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../server/email", () => ({
  sendAutoCompleted: vi.fn().mockResolvedValue(undefined),
  sendOrderCancelled: vi.fn().mockResolvedValue(undefined),
}));

import { startJobs } from "../../server/jobs";
import { db } from "../../server/storage";
import { confirmDelivery } from "../../server/payments";
import { sendAutoCompleted, sendOrderCancelled } from "../../server/email";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Flush all pending microtasks. */
function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Route advisory-lock query responses by lockId param so that concurrent
 * lock-acquire calls (all three jobs fire simultaneously) get deterministic
 * responses regardless of call order.
 */
function acquireOnlyLock(targetLockId: number) {
  clientMock.query.mockImplementation(async (sql: string, params?: any[]) => {
    if (sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ pg_try_advisory_lock: params?.[0] === targetLockId }] };
    }
    return { rows: [] };
  });
}

function acquireAllLocks() {
  clientMock.query.mockImplementation(async (sql: string) => {
    if (sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ pg_try_advisory_lock: true }] };
    }
    return { rows: [] };
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeEach(() => {
  dbResults.length = 0;

  // mockReset clears both call history AND the "once" queue so previous test
  // values don't leak into the next test.
  clientMock.query.mockReset();
  clientMock.release.mockReset();
  poolMock.connect.mockReset();

  // clearAllMocks clears history on the db/payment/email mocks
  vi.clearAllMocks();

  // Default: no lock acquired → all three jobs skip immediately
  clientMock.query.mockImplementation(async (sql: string) => {
    if (sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ pg_try_advisory_lock: false }] };
    }
    return { rows: [] };
  });
  clientMock.release.mockReturnValue(undefined);
  poolMock.connect.mockResolvedValue(clientMock);
});

afterEach(() => {
  vi.useRealTimers();
});

// ──────────────────────────────────────────────────────────────────────────
// startJobs — basic contract
// ──────────────────────────────────────────────────────────────────────────

describe("startJobs", () => {
  it("resolves immediately without blocking on background jobs", async () => {
    await expect(startJobs()).resolves.toBeUndefined();
  });

  it("logs a startup message", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await startJobs();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[jobs]"));
    logSpy.mockRestore();
  });

  it("schedules a 6-hour recurring interval via setInterval", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");
    await startJobs();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1]).toBe(6 * 60 * 60 * 1000);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Advisory lock — skip behaviour (default: all locks return false)
// ──────────────────────────────────────────────────────────────────────────

describe("advisory lock — skip when not acquired", () => {
  it("calls pool.connect once per job (3 jobs on startup)", async () => {
    startJobs();
    await flushPromises();
    expect(poolMock.connect).toHaveBeenCalledTimes(3);
  });

  it("queries pg_try_advisory_lock once per job", async () => {
    startJobs();
    await flushPromises();
    const lockCalls = clientMock.query.mock.calls.filter((c: any[]) =>
      String(c[0]).includes("pg_try_advisory_lock"),
    );
    expect(lockCalls.length).toBe(3);
  });

  it("does NOT call db.select when no lock is acquired", async () => {
    startJobs();
    await flushPromises();
    expect(vi.mocked(db).select).not.toHaveBeenCalled();
  });

  it("releases the pool client after the lock check regardless of outcome", async () => {
    startJobs();
    await flushPromises();
    expect(clientMock.release).toHaveBeenCalledTimes(3);
  });
});

describe("advisory lock — error handling", () => {
  it("logs advisory lock errors when lock queries fail", async () => {
    clientMock.query.mockImplementation(async (sql: string) => {
      if (sql.includes("pg_try_advisory_lock")) {
        throw new Error("Lock query failed");
      }
      return { rows: [] };
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    startJobs();
    await flushPromises();

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Advisory lock error"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// autoCompleteTransactions — lock 8301
// ──────────────────────────────────────────────────────────────────────────

describe("autoCompleteTransactions", () => {
  it("queries db.select when lock is acquired with no stale data", async () => {
    acquireAllLocks();
    // dbResults empty → all selects return []

    startJobs();
    await flushPromises();

    expect(vi.mocked(db).select).toHaveBeenCalled();
    expect(vi.mocked(confirmDelivery)).not.toHaveBeenCalled();
  });

  it("calls confirmDelivery for a stale transaction", async () => {
    acquireOnlyLock(8301);

    dbResults.push(
      [{ id: 42, buyerId: 1, sellerId: 2, bookId: 5, sellerPayout: 18.0 }],
      [{ title: "Dune" }],
      [{ email: "buyer@test.com" }],
      [{ email: "seller@test.com" }],
    );

    startJobs();
    await flushPromises();

    expect(vi.mocked(confirmDelivery)).toHaveBeenCalledWith(42, 1);
  });

  it("sends auto-complete emails to both buyer and seller", async () => {
    acquireOnlyLock(8301);

    dbResults.push(
      [{ id: 7, buyerId: 10, sellerId: 20, bookId: 3, sellerPayout: 14.0 }],
      [{ title: "Foundation" }],
      [{ email: "buyer@x.com" }],
      [{ email: "seller@x.com" }],
    );

    startJobs();
    await flushPromises();
    await flushPromises(); // fire-and-forget emails

    expect(vi.mocked(sendAutoCompleted)).toHaveBeenCalledWith("buyer@x.com", "buyer", "Foundation");
    expect(vi.mocked(sendAutoCompleted)).toHaveBeenCalledWith("seller@x.com", "seller", "Foundation");
  });

  it("catches confirmDelivery errors and logs them without crashing", async () => {
    acquireOnlyLock(8301);
    vi.mocked(confirmDelivery).mockRejectedValueOnce(new Error("Stripe error"));
    dbResults.push([{ id: 99, buyerId: 1, sellerId: 2, bookId: 5, sellerPayout: 10.0 }]);

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await startJobs();
    await flushPromises();

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[jobs]"), expect.any(Error));
    errSpy.mockRestore();
  });

  it("logs buyer/seller email delivery errors without crashing", async () => {
    acquireOnlyLock(8301);
    const buyerErr = new Error("buyer email failed");
    const sellerErr = new Error("seller email failed");
    vi.mocked(sendAutoCompleted)
      .mockRejectedValueOnce(buyerErr)
      .mockRejectedValueOnce(sellerErr);

    dbResults.push(
      [{ id: 17, buyerId: 10, sellerId: 20, bookId: 3, sellerPayout: 11.0 }],
      [{ title: "Hyperion" }],
      [{ email: "buyer@x.com" }],
      [{ email: "seller@x.com" }],
    );

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    startJobs();
    await flushPromises();
    await flushPromises();

    expect(errSpy).toHaveBeenCalledWith("[jobs] email error (buyer auto-complete):", buyerErr);
    expect(errSpy).toHaveBeenCalledWith("[jobs] email error (seller auto-complete):", sellerErr);
    errSpy.mockRestore();
  });
});

describe("expireOffers", () => {
  it("logs expired stale-offer counts when rows are updated", async () => {
    acquireOnlyLock(8302);
    vi.mocked(db).execute.mockResolvedValueOnce({ rowCount: 2 } as any);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    startJobs();
    await flushPromises();

    expect(vi.mocked(db).execute).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("[jobs] Expired 2 stale offer(s)");
    logSpy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// expireAbandonedTransactions — lock 8303
// ──────────────────────────────────────────────────────────────────────────

describe("expireAbandonedTransactions", () => {
  it("cancels abandoned transactions, re-lists books, and emails buyer", async () => {
    acquireOnlyLock(8303);

    dbResults.push(
      [{ id: 55, buyerId: 3, bookId: 7 }], // stale tx query
      [],                                   // db.update(transactions).set().where() — cancel
      [],                                   // db.update(books).set().where()        — re-list
      [{ email: "buyer@abandoned.com" }],   // buyer email lookup
      [{ title: "Lost Book" }],             // book title lookup
    );

    startJobs();
    await flushPromises();
    await flushPromises();

    expect(vi.mocked(db).update).toHaveBeenCalled();
    expect(vi.mocked(sendOrderCancelled)).toHaveBeenCalledWith(
      "buyer@abandoned.com",
      "buyer",
      "Lost Book",
    );
  });

  it("does nothing when there are no abandoned transactions", async () => {
    acquireOnlyLock(8303);
    // dbResults empty → stale query returns []

    startJobs();
    await flushPromises();

    expect(vi.mocked(db).update).not.toHaveBeenCalled();
    expect(vi.mocked(sendOrderCancelled)).not.toHaveBeenCalled();
  });

  it("logs buyer email send errors for abandoned transaction notifications", async () => {
    acquireOnlyLock(8303);
    const emailErr = new Error("mail server down");
    vi.mocked(sendOrderCancelled).mockRejectedValueOnce(emailErr);

    dbResults.push(
      [{ id: 88, buyerId: 4, bookId: 9 }],
      [],
      [],
      [{ email: "buyer@abandoned.com" }],
      [{ title: "Snow Crash" }],
    );

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    startJobs();
    await flushPromises();
    await flushPromises();

    expect(errSpy).toHaveBeenCalledWith("[jobs] email error (abandoned tx expiry):", emailErr);
    errSpy.mockRestore();
  });

  it("logs and continues when expiring a stale pending transaction throws", async () => {
    acquireOnlyLock(8303);
    const updateErr = new Error("update failed");

    dbResults.push(
      [{ id: 99, buyerId: 4, bookId: 9 }],
      Promise.reject(updateErr),
    );

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    startJobs();
    await flushPromises();

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to expire transaction 99"),
      updateErr,
    );
    expect(vi.mocked(sendOrderCancelled)).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Error handling — jobs must not crash the process
// ──────────────────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("catches pool.connect errors gracefully and logs them", async () => {
    poolMock.connect.mockRejectedValue(new Error("Connection refused"));

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await startJobs();
    await flushPromises();

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[jobs]"),
      expect.any(Error),
    );
    errSpy.mockRestore();
  });
});
