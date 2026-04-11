/**
 * Integration tests for admin API routes.
 *
 * The database layer and external helpers are fully mocked so the tests
 * run without a real Postgres connection.  Unlike routes.test.ts, this
 * file does NOT mock server/admin — that is the module under test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "http";

// ─── hoisted queue for db call results ────────────────────────────────────
const dbCallQueue = vi.hoisted(() => [] as any[]);

// ─── mock heavy server-side modules ────────────────────────────────────────

vi.mock("../../server/storage", () => {
  const storageMock = {
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    getUserByEmail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    getBook: vi.fn(),
    getBooks: vi.fn(),
    getBooksByUser: vi.fn(),
    createBook: vi.fn(),
    updateBook: vi.fn(),
    deleteBook: vi.fn(),
    getBookRequests: vi.fn(),
    getBookRequest: vi.fn(),
    createBookRequest: vi.fn(),
    updateBookRequest: vi.fn(),
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    createMessage: vi.fn(),
    markMessagesRead: vi.fn(),
    getUnreadCount: vi.fn(),
    getOffers: vi.fn(),
    getOffer: vi.fn(),
    createOffer: vi.fn(),
    updateOffer: vi.fn(),
  };

  const dbMock = {
    then(resolve: (value: any) => void, reject: (reason?: any) => void) {
      const value = dbCallQueue.length > 0 ? dbCallQueue.shift() : [];
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
    delete: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };

  const poolMock = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };

  return {
    storage: storageMock,
    db: dbMock,
    pool: poolMock,
    DatabaseStorage: vi.fn(),
  };
});

vi.mock("../../server/payments", () => ({
  createPaymentIntent: vi.fn(),
  confirmPayment: vi.fn(),
  failPayment: vi.fn(),
  handleSellerAccountUpdated: vi.fn(),
  handleTransferFailed: vi.fn(),
  handleChargeRefunded: vi.fn(),
  refundPayment: vi.fn().mockResolvedValue(undefined),
  markShipped: vi.fn(),
  confirmDelivery: vi.fn(),
  getUserTransactions: vi.fn().mockResolvedValue([]),
  PLATFORM_FEE_PERCENT: 0.1,
  createSellerAccount: vi.fn(),
  checkSellerStatus: vi.fn(),
}));

vi.mock("../../server/platform-settings", () => ({
  getAllSettings: vi.fn().mockResolvedValue({}),
  getSettings: vi.fn().mockResolvedValue({}),
  getSetting: vi.fn().mockResolvedValue(null),
  setSettings: vi.fn().mockResolvedValue(undefined),
  setSetting: vi.fn().mockResolvedValue(undefined),
  isEnabled: vi.fn().mockResolvedValue(false),
  SECRET_KEYS: new Set([
    "stripe_secret_key",
    "stripe_webhook_secret",
    "paypal_client_secret",
  ]),
  maskSecret: vi.fn((v: string | null) =>
    v && v.length > 4 ? `${"•".repeat(Math.min(v.length - 4, 12))}${v.slice(-4)}` : v ? "••••" : null,
  ),
}));

vi.mock("../../server/work-resolver", () => ({
  resolveWork: vi.fn().mockResolvedValue({ workId: 1, isNew: false, confidence: "high" }),
  getWorkEditions: vi.fn().mockResolvedValue({
    catalogEditions: {},
    userListings: {},
    languages: [],
    totalEditions: 0,
    totalListings: 0,
  }),
  updateWorkStats: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../shared/password-policy", () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("$2b$12$mockedhash"),
  },
}));

// ─── imports after mocks ────────────────────────────────────────────────────

import { storage, pool, db } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import { getAllSettings, setSettings, maskSecret } from "../../server/platform-settings";
import { refundPayment } from "../../server/payments";
import bcrypt from "bcryptjs";

// ─── helpers ───────────────────────────────────────────────────────────────

async function buildApp() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

const mockStorage = storage as ReturnType<typeof vi.mocked<typeof storage>>;

/** Push values onto the db queue so that successive `await db...` calls each
 *  resolve to the corresponding entry in the array. */
function pushDbResults(...values: any[]) {
  dbCallQueue.push(...values);
}

const adminUser = {
  id: 1,
  username: "admin",
  displayName: "Admin User",
  email: "admin@example.com",
  password: "$2b$12$hashedpassword",
  role: "admin",
  rating: 5,
  totalSales: 0,
  totalPurchases: 0,
  createdAt: new Date("2024-01-01"),
};

const regularUser = {
  id: 2,
  username: "regular",
  displayName: "Regular User",
  email: "regular@example.com",
  password: "$2b$12$hashedpassword",
  role: "user",
  rating: 4,
  totalSales: 0,
  totalPurchases: 0,
  createdAt: new Date("2024-01-01"),
};

async function loginAs(app: express.Express, user: any) {
  vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as any);
  mockStorage.getUserByEmail.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: user.email, password: "password" });
  return agent;
}

// ──────────────────────────────────────────────────────────────────────────
// Access control
// ──────────────────────────────────────────────────────────────────────────

describe("Admin access control", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 for unauthenticated requests to /api/admin/check", async () => {
    const res = await request(app).get("/api/admin/check");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users on /api/admin/check", async () => {
    const agent = await loginAs(app, regularUser);
    mockStorage.getUser.mockResolvedValueOnce(regularUser);
    const res = await agent.get("/api/admin/check");
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin access required/i);
  });

  it("returns 403 for non-admin users on /api/admin/overview", async () => {
    const agent = await loginAs(app, regularUser);
    mockStorage.getUser.mockResolvedValueOnce(regularUser);
    const res = await agent.get("/api/admin/overview");
    expect(res.status).toBe(403);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/check
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/check", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns isAdmin: true for an admin user", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/check");

    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
    expect(res.body.userId).toBe(adminUser.id);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/overview
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/overview", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns platform stats from the database", async () => {
    // Overview makes 9 sequential db calls:
    //   1. userCount  2. bookCount  3. catalogCount  4. workCount
    //   5. requestCount  6. messageCount  7. txStats
    //   8. activeListings  9. newUsers
    pushDbResults(
      [{ count: 42 }],                       // userCount
      [{ count: 120 }],                      // bookCount
      [{ count: 500 }],                      // catalogCount
      [{ count: 400 }],                      // workCount
      [{ count: 15 }],                       // requestCount
      [{ count: 88 }],                       // messageCount
      [{                                     // txStats
        total: 10,
        totalRevenue: 200,
        totalFees: 20,
        totalPayouts: 180,
        completed: 8,
        pending: 1,
        paid: 0,
        shipped: 1,
        disputed: 0,
      }],
      [{ count: 30 }],                       // activeListings
      [{ count: 5 }],                        // newUsersLast7Days
    );

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/overview");

    expect(res.status).toBe(200);
    expect(res.body.users).toBe(42);
    expect(res.body.newUsersLast7Days).toBe(5);
    expect(res.body.books).toBe(120);
    expect(res.body.activeListings).toBe(30);
    expect(res.body.catalog).toBe(500);
    expect(res.body.works).toBe(400);
    expect(res.body.requests).toBe(15);
    expect(res.body.messages).toBe(88);
    expect(res.body.transactions.total).toBe(10);
    expect(res.body.transactions.completed).toBe(8);
    expect(res.body.transactions.disputed).toBe(0);
    expect(res.body.revenue.totalSales).toBe("200.00");
    expect(res.body.revenue.platformFees).toBe("20.00");
    expect(res.body.revenue.sellerPayouts).toBe("180.00");
  });

  it("returns 500 when a db call throws", async () => {
    // Make the db.select spy throw on the first call to simulate a DB error
    vi.spyOn(db as any, "select").mockImplementationOnce(() => {
      throw new Error("db error");
    });

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/overview");

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to fetch overview/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/transactions
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/transactions", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns empty list when no transactions exist", async () => {
    // 1. transaction rows  2. total count
    pushDbResults([], [{ count: 0 }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/transactions");

    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("enriches transactions with buyer, seller, and book info", async () => {
    const tx = {
      id: 7,
      buyerId: 2,
      sellerId: 3,
      bookId: 4,
      amount: 15.99,
      platformFee: 1.6,
      sellerPayout: 14.39,
      status: "pending",
      createdAt: new Date("2024-06-01"),
    };
    // 1. transaction rows  2. buyer  3. seller  4. book  5. total count
    pushDbResults(
      [tx],
      [{ id: 2, username: "buyer", displayName: "Buyer", email: "buyer@test.com" }],
      [{ id: 3, username: "seller", displayName: "Seller", email: "seller@test.com" }],
      [{ id: 4, title: "Test Book", author: "Test Author" }],
      [{ count: 1 }],
    );

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/transactions");

    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].id).toBe(7);
    expect(res.body.transactions[0].buyer.username).toBe("buyer");
    expect(res.body.transactions[0].seller.username).toBe("seller");
    expect(res.body.transactions[0].book.title).toBe("Test Book");
    expect(res.body.total).toBe(1);
  });

  it("accepts a status filter query param", async () => {
    pushDbResults([], [{ count: 0 }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/transactions?status=disputed");
    expect(res.status).toBe(200);
    expect(res.body.transactions).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/revenue
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/revenue", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns monthly revenue breakdown and pending payouts", async () => {
    const monthlyRow = {
      month: "2024-06",
      sales: 5,
      revenue: 99.95,
      fees: 10.0,
      payouts: 89.95,
    };
    // 1. monthly breakdown  2. pendingPayouts
    pushDbResults(
      [monthlyRow],
      [{ count: 2, total: 34.5 }],
    );

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/revenue");

    expect(res.status).toBe(200);
    expect(res.body.monthly).toHaveLength(1);
    expect(res.body.monthly[0].month).toBe("2024-06");
    expect(res.body.pendingPayouts.count).toBe(2);
    expect(res.body.pendingPayouts.total).toBe("34.50");
  });

  it("returns empty monthly list when there are no completed transactions", async () => {
    pushDbResults([], [{ count: 0, total: 0 }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/revenue");
    expect(res.status).toBe(200);
    expect(res.body.monthly).toEqual([]);
    expect(res.body.pendingPayouts.count).toBe(0);
    expect(res.body.pendingPayouts.total).toBe("0.00");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/users
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns paginated user list", async () => {
    const userRow = {
      id: 3,
      username: "testuser",
      displayName: "Test User",
      email: "test@example.com",
      role: "user",
      rating: 4.2,
      totalSales: 3,
      totalPurchases: 1,
      createdAt: new Date("2024-01-15"),
    };
    // 1. user rows  2. total count
    pushDbResults([userRow], [{ count: 1 }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/users");

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].username).toBe("testuser");
    expect(res.body.total).toBe(1);
  });

  it("returns empty list when no users exist", async () => {
    pushDbResults([], [{ count: 0 }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/users");
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
    expect(res.body.total).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/users/:id
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/users/:id", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns user detail with books and transactions", async () => {
    const userRow = {
      id: 5,
      username: "detailuser",
      displayName: "Detail User",
      email: "detail@example.com",
      role: "user",
      bio: "Bio here",
      location: "NYC",
      rating: 4.5,
      totalSales: 2,
      totalPurchases: 1,
      createdAt: new Date("2024-02-01"),
    };
    // 1. user  2. their books  3. their transactions
    pushDbResults([userRow], [], []);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/users/5");
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("detailuser");
    expect(res.body.books).toEqual([]);
    expect(res.body.transactions).toEqual([]);
  });

  it("returns 404 when the user does not exist", async () => {
    // db returns empty array → destructuring gives undefined
    pushDbResults([]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/users/999");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/users/:id/suspend
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/users/:id/suspend", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("suspends an active user", async () => {
    // 1. select user (role=user)  — update resolves with [] by default
    pushDbResults([{ id: 2, username: "regularuser", role: "user" }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/users/2/suspend");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/suspended/i);
    expect(res.body.role).toBe("suspended");
  });

  it("unsuspends a suspended user", async () => {
    pushDbResults([{ id: 2, username: "banneduser", role: "suspended" }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/users/2/suspend");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("user");
  });

  it("refuses to suspend another admin", async () => {
    pushDbResults([{ id: 3, username: "otheradmin", role: "admin" }]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/users/3/suspend");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot suspend an admin/i);
  });

  it("returns 404 when the user does not exist", async () => {
    pushDbResults([]);

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/users/999/suspend");
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/transactions/:id/dispute
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/transactions/:id/dispute", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("marks a transaction as disputed", async () => {
    // update call resolves with [] by default (queue is empty)
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/transactions/7/dispute");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/disputed/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/transactions/:id/refund
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/transactions/:id/refund", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("refunds a transaction by calling refundPayment", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/transactions/7/refund");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/refunded/i);
    expect(vi.mocked(refundPayment)).toHaveBeenCalledWith(7);
  });

  it("returns 400 when refundPayment throws", async () => {
    vi.mocked(refundPayment).mockRejectedValueOnce(new Error("Payment not found"));

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/transactions/99/refund");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/payment not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/admin/settings
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/admin/settings", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns settings with secret values masked", async () => {
    vi.mocked(getAllSettings).mockResolvedValueOnce({
      stripe_enabled: "true",
      stripe_secret_key: "sk_live_ABCDEFGH1234",
      stripe_publishable_key: "pk_live_TEST",
      platform_fee_percent: "10",
      paypal_enabled: "false",
      paypal_client_secret: "EHsecretABCD",
    });

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/settings");
    expect(res.status).toBe(200);
    // Non-secret fields are passed through unchanged
    expect(res.body.stripe_enabled).toBe("true");
    expect(res.body.platform_fee_percent).toBe("10");
    expect(res.body.stripe_publishable_key).toBe("pk_live_TEST");
    // Secret fields are masked by the mock maskSecret function
    expect(res.body.stripe_secret_key).not.toBe("sk_live_ABCDEFGH1234");
    expect(res.body.paypal_client_secret).not.toBe("EHsecretABCD");
  });

  it("returns 500 when getAllSettings throws", async () => {
    vi.mocked(getAllSettings).mockRejectedValueOnce(new Error("db down"));

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.get("/api/admin/settings");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to fetch settings/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PUT /api/admin/settings
// ──────────────────────────────────────────────────────────────────────────

describe("PUT /api/admin/settings", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("saves settings and returns success", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.put("/api/admin/settings").send({
      stripe_enabled: "true",
      stripe_publishable_key: "pk_test_XXXX",
      platform_fee_percent: "12",
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/settings saved/i);
    expect(vi.mocked(setSettings)).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_enabled: "true", platform_fee_percent: "12" }),
    );
  });

  it("skips blank secret fields so existing secrets are preserved", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.put("/api/admin/settings").send({
      stripe_enabled: "false",
      stripe_secret_key: "",          // blank — should be skipped
      paypal_client_secret: "",        // blank — should be skipped
    });

    expect(res.status).toBe(200);
    // Secret keys with blank values must NOT appear in the saved payload
    const savedPayload = vi.mocked(setSettings).mock.calls[0]?.[0] ?? {};
    expect("stripe_secret_key" in savedPayload).toBe(false);
    expect("paypal_client_secret" in savedPayload).toBe(false);
  });

  it("skips masked placeholder values for secrets", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    // Masked placeholder pattern: ^•+[^•]{1,4}$ (bullets + 1–4 trailing non-bullet chars)
    const res = await agent.put("/api/admin/settings").send({
      stripe_secret_key: "••••••••1234",    // matches pattern → should be skipped
      stripe_webhook_secret: "••••••••wsec", // matches pattern → should be skipped
    });

    expect(res.status).toBe(200);
    const savedPayload = vi.mocked(setSettings).mock.calls[0]?.[0] ?? {};
    expect("stripe_secret_key" in savedPayload).toBe(false);
    expect("stripe_webhook_secret" in savedPayload).toBe(false);
  });

  it("returns 400 when body is not a JSON object", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent
      .put("/api/admin/settings")
      .set("Content-Type", "application/json")
      .send(JSON.stringify([1, 2, 3]));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/body must be a json object/i);
  });

  it("returns 500 when setSettings throws", async () => {
    vi.mocked(setSettings).mockRejectedValueOnce(new Error("db write failure"));

    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent
      .put("/api/admin/settings")
      .send({ stripe_enabled: "true" });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to save settings/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/admin/seed
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/admin/seed", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 400 when no queries are provided", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/seed").send({ queries: [] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/please provide/i);
  });

  it("returns 400 when queries field is missing", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent.post("/api/admin/seed").send({});
    expect(res.status).toBe(400);
  });

  it("accepts valid queries and starts the seed process in the background", async () => {
    const agent = await loginAs(app, adminUser);
    mockStorage.getUser.mockResolvedValueOnce(adminUser);

    const res = await agent
      .post("/api/admin/seed")
      .send({ queries: ["fantasy novels", "science fiction"] });

    // Endpoint always returns 202 (background process, non-blocking)
    expect(res.status).toBe(202);
    expect(res.body.message).toMatch(/started/i);
  });
});
