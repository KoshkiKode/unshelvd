/**
 * Integration tests for API routes.
 *
 * The database layer and external helpers are fully mocked so the tests
 * run without a real Postgres connection.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "http";

// ─── hoisted queue for db call results ────────────────────────────────────
// vi.hoisted ensures this is available inside the vi.mock factory below.
const dbCallQueue = vi.hoisted(() => [] as any[]);

// ─── mock heavy server-side modules before importing routes ────────────────

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
    deleteBookRequest: vi.fn(),
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

  // A chainable, thenable db mock.
  // All chain methods return `this` so calls can be composed synchronously.
  // `then` makes the chain awaitable: `await db.select().from(t)` resolves to
  // the next value pushed onto dbCallQueue (or [] by default).
  const dbMock = {
    then(
      resolve: (value: any) => void,
      reject: (reason?: any) => void,
    ) {
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
  refundPayment: vi.fn(),
  markShipped: vi.fn(),
  confirmDelivery: vi.fn(),
  getUserTransactions: vi.fn().mockResolvedValue([]),
  PLATFORM_FEE_PERCENT: 0.1,
  createSellerAccount: vi.fn(),
  checkSellerStatus: vi.fn(),
  getStripe: vi.fn().mockResolvedValue(null),
  isStripeEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../server/admin", () => ({
  registerAdminRoutes: vi.fn(),
}));

vi.mock("../../server/paypal", () => ({
  isPayPalEnabled: vi.fn(),
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
}));

vi.mock("../../server/work-resolver", () => ({
  resolveWork: vi.fn().mockResolvedValue({ workId: 1, isNew: false, confidence: "high" }),
  getWorkEditions: vi.fn().mockResolvedValue({ catalogEditions: {}, userListings: {}, languages: [], totalEditions: 0, totalListings: 0 }),
  updateWorkStats: vi.fn().mockResolvedValue(undefined),
}));

// Mock @shared/password-policy to avoid side-effects
vi.mock("../../shared/password-policy", () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true, errors: [] }),
}));

// Mock bcryptjs so tests can control password comparison without real hashing
vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn().mockResolvedValue("$2b$12$mockedhash"),
  },
}));

// ─── import after mocks are set up ─────────────────────────────────────────

import { storage, pool } from "../../server/storage";
import { registerRoutes } from "../../server/routes";
import bcrypt from "bcryptjs";
import {
  createPaymentIntent,
  confirmPayment,
  markShipped,
  confirmDelivery,
  getUserTransactions,
  createSellerAccount,
  checkSellerStatus,
  handleChargeRefunded,
} from "../../server/payments";
import { isPayPalEnabled, createPayPalOrder, capturePayPalOrder } from "../../server/paypal";
import { validatePassword } from "../../shared/password-policy";

// ─── test helpers ──────────────────────────────────────────────────────────

async function buildApp() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

const mockStorage = storage as ReturnType<typeof vi.mocked<typeof storage>>;
const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

/** Push values onto the db queue so that successive `await db.select()...` calls
 *  each resolve to the corresponding entry in the array. */
function pushDbResults(...values: any[]) {
  dbCallQueue.push(...values);
}

/**
 * Log in as `user` and return a persistent supertest agent whose session
 * cookie is preserved across requests. Call `mockStorage.getUser.mockResolvedValueOnce(user)`
 * before each subsequent authenticated request so that passport's
 * deserializeUser can find the user.
 */
async function loginAs(app: express.Express, user: any) {
  vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as any);
  mockStorage.getUserByEmail.mockResolvedValueOnce(user);
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: user.email, password: "password" });
  return agent;
}

// ──────────────────────────────────────────────────────────────────────────
// Auth routes
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/register", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is already registered", async () => {
    (mockStorage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 1,
      email: "taken@example.com",
    });

    const res = await request(app).post("/api/auth/register").send({
      username: "newuser",
      displayName: "New User",
      email: "taken@example.com",
      password: "SecurePass1@ABC",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email already registered/i);
  });

  it("returns 400 when username is already taken", async () => {
    (mockStorage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (mockStorage.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 2,
      username: "existinguser",
    });

    const res = await request(app).post("/api/auth/register").send({
      username: "existinguser",
      displayName: "Existing User",
      email: "unique@example.com",
      password: "SecurePass1@ABC",
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/username already taken/i);
  });

  it("returns 200 and user data on successful registration", async () => {
    const createdUser = {
      id: 99,
      username: "newuser",
      displayName: "New User",
      email: "new@example.com",
      password: "hashed",
      bio: null,
      avatarUrl: null,
      location: null,
      rating: 0,
      totalSales: 0,
      totalPurchases: 0,
      role: "user",
      stripeAccountId: null,
      stripeOnboarded: false,
      createdAt: new Date(),
    };

    (mockStorage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (mockStorage.getUserByUsername as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    (mockStorage.createUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(createdUser);

    const res = await request(app).post("/api/auth/register").send({
      username: "newuser",
      displayName: "New User",
      email: "new@example.com",
      password: "SecurePass1@ABC",
    });

    expect(res.status).toBe(200);
    // Password must not be sent back to the client
    expect(res.body).not.toHaveProperty("password");
    expect(res.body.username).toBe("newuser");
  });
});

describe("POST /api/auth/login", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when the user does not exist", async () => {
    (mockStorage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "pass" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the password is wrong", async () => {
    const user = {
      id: 1,
      email: "alice@example.com",
      password: "$2b$12$wronghash",
      username: "alice",
      displayName: "Alice",
    };
    mockStorage.getUserByEmail.mockResolvedValueOnce(user);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as any);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "wrongpass" });

    expect(res.status).toBe(401);
  });

  it("returns 200 and user data on successful login", async () => {
    const user = {
      id: 1,
      email: "alice@example.com",
      password: "$2b$12$mockedhash",
      username: "alice",
      displayName: "Alice",
      bio: null,
      avatarUrl: null,
      location: null,
      rating: 0,
      totalSales: 0,
      totalPurchases: 0,
      role: "user",
      stripeAccountId: null,
      stripeOnboarded: false,
      createdAt: new Date(),
    };
    mockStorage.getUserByEmail.mockResolvedValueOnce(user);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as any);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@example.com", password: "correctpass" });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
    expect(res.body.password).toBeUndefined();
  });
});

describe("GET /api/auth/me", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user (without password) when authenticated", async () => {
    const AUTH_USER = {
      id: 42,
      username: "tester",
      displayName: "Test User",
      email: "tester@example.com",
      password: "$2b$12$mockedhash",
      bio: null,
      avatarUrl: null,
      location: null,
      rating: 0,
      totalSales: 0,
      totalPurchases: 0,
      role: "user",
      stripeAccountId: null,
      stripeOnboarded: false,
      createdAt: new Date(),
    };
    const agent = await loginAs(app, AUTH_USER);
    mockStorage.getUser.mockResolvedValueOnce(AUTH_USER);

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("tester");
    expect(res.body.password).toBeUndefined();
  });
});

describe("POST /api/auth/logout", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 200 with a success message", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Logged out");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Books routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/books", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    (mockStorage.getBooks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it("returns an array (empty by default)", async () => {
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns a list of books when they exist", async () => {
    const books = [
      { id: 1, title: "Book A", author: "Author A", status: "for-sale", condition: "good" },
    ];
    (mockStorage.getBooks as ReturnType<typeof vi.fn>).mockResolvedValueOnce(books);

    const res = await request(app).get("/api/books");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Book A");
  });

  it("passes query parameters to the storage layer", async () => {
    await request(app).get("/api/books?search=dune&genre=Science+Fiction&limit=10");
    const callArgs = (mockStorage.getBooks as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.search).toBe("dune");
    expect(callArgs.genre).toBe("Science Fiction");
    expect(callArgs.limit).toBe(10);
  });

  it("returns 500 when storage throws", async () => {
    (mockStorage.getBooks as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app).get("/api/books");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/books/:id", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/books/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when book is not found", async () => {
    (mockStorage.getBook as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const res = await request(app).get("/api/books/999");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns the book with seller info when found", async () => {
    const book = { id: 1, title: "Test Book", author: "Author", userId: 5, status: "for-sale", condition: "good" };
    const seller = { id: 5, username: "seller", displayName: "Seller Name", avatarUrl: null, rating: 4.5, totalSales: 10, location: "NYC" };

    (mockStorage.getBook as ReturnType<typeof vi.fn>).mockResolvedValueOnce(book);
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(seller);

    const res = await request(app).get("/api/books/1");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Test Book");
    expect(res.body.seller.username).toBe("seller");
  });
});

describe("GET /api/books/user/:userId", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 400 for a non-numeric userId", async () => {
    const res = await request(app).get("/api/books/user/bad");
    expect(res.status).toBe(400);
  });

  it("returns books for the given user", async () => {
    const books = [{ id: 1, title: "My Book", userId: 3 }];
    (mockStorage.getBooksByUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(books);

    const res = await request(app).get("/api/books/user/3");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/books (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/books").send({
      title: "New Book",
      author: "Author",
      condition: "good",
      status: "for-sale",
    });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/books/:id (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).patch("/api/books/1").send({ title: "Updated" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric id even when unauthenticated", async () => {
    const res = await request(app).patch("/api/books/abc").send({});
    // 401 is returned first (requireAuth before id check)
    expect([400, 401]).toContain(res.status);
  });
});

describe("DELETE /api/books/:id (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).delete("/api/books/1");
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Book Requests routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/requests", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
    (mockStorage.getBookRequests as ReturnType<typeof vi.fn>).mockResolvedValue({ requests: [], total: 0 });
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("returns an array", async () => {
    const res = await request(app).get("/api/requests");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.requests)).toBe(true);
  });

  it("enriches each request with user info", async () => {
    const req1 = { id: 1, title: "Dune", userId: 7, status: "open", createdAt: new Date() };
    const user7 = { id: 7, username: "frank", displayName: "Frank Herbert", avatarUrl: null };

    (mockStorage.getBookRequests as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ requests: [req1], total: 1 });
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(user7);

    const res = await request(app).get("/api/requests");
    expect(res.status).toBe(200);
    expect(res.body.requests[0].user.username).toBe("frank");
  });
});

describe("POST /api/requests (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/requests")
      .send({ title: "Dune" });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/requests/:id (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).patch("/api/requests/1").send({});
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Search routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/search/books", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns an empty array when query is missing", async () => {
    const res = await request(app).get("/api/search/books");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns an empty array when query is a single character", async () => {
    const res = await request(app).get("/api/search/books?q=a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Messages routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/messages (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/messages");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/messages (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/messages")
      .send({ receiverId: 2, content: "Hello" });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Offers routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/offers (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/offers");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/offers (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/offers")
      .send({ bookId: 1, amount: 10 });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// User routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/users/:id", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/users/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the user does not exist", async () => {
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
    const res = await request(app).get("/api/users/999");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns the user without password on success", async () => {
    const user = {
      id: 7,
      username: "alice",
      displayName: "Alice Smith",
      email: "alice@example.com",
      password: "hashed-secret",
      bio: null,
      avatarUrl: null,
      location: null,
      rating: 4.5,
      totalSales: 3,
      totalPurchases: 5,
      role: "user",
      stripeAccountId: null,
      stripeOnboarded: false,
      createdAt: new Date(),
    };
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(user);

    const res = await request(app).get("/api/users/7");
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("alice");
    expect(res.body).not.toHaveProperty("password");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Payments — fee-info (no auth required)
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/payments/fee-info", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns the platform fee percentage", async () => {
    const res = await request(app).get("/api/payments/fee-info");
    expect(res.status).toBe(200);
    expect(res.body.platformFeePercent).toBe(10);
    expect(res.body).toHaveProperty("description");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Stripe webhook — dev-mode (no STRIPE_WEBHOOK_SECRET)
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/stripe (dev mode)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    app = await buildApp();
  });

  it("returns { received: true } for an unrecognised event type", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({ type: "unknown.event", data: { object: {} } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("handles payment_intent.succeeded without metadata gracefully", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({
        type: "payment_intent.succeeded",
        data: { object: { metadata: {} } },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("handles payment_intent.payment_failed with no pi id gracefully", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({
        type: "payment_intent.payment_failed",
        data: { object: { id: null } },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("handles account.updated event", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({
        type: "account.updated",
        data: {
          object: {
            id: "acct_test",
            details_submitted: true,
            charges_enabled: true,
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it("handles charge.refunded event", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_test",
            payment_intent: "pi_test123",
          },
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(handleChargeRefunded).toHaveBeenCalledWith("pi_test123");
  });

  it("handles charge.refunded event with no payment_intent gracefully", async () => {
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({
        type: "charge.refunded",
        data: { object: { id: "ch_test" } },
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Works routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/works/:id", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/works/abc");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid work id/i);
  });

  it("returns 404 when the work does not exist", async () => {
    pushDbResults([]); // db returns empty array → no work found
    const res = await request(app).get("/api/works/99");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns the work with editions on success", async () => {
    const work = { id: 1, title: "War and Peace", author: "Tolstoy" };
    pushDbResults([work]); // db returns the work
    const res = await request(app).get("/api/works/1");
    expect(res.status).toBe(200);
    expect(res.body.work.title).toBe("War and Peace");
    // getWorkEditions is mocked and adds these fields
    expect(res.body).toHaveProperty("totalEditions");
  });
});

describe("GET /api/works (search)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns an array of works", async () => {
    pushDbResults([{ id: 1, title: "Dune", author: "Herbert" }]);
    const res = await request(app).get("/api/works");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns an empty array when no works match", async () => {
    pushDbResults([]);
    const res = await request(app).get("/api/works?q=nonexistent");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/works/:id/editions", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/works/xyz/editions");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid work id/i);
  });

  it("returns editions for a valid work id (via mocked getWorkEditions)", async () => {
    const res = await request(app).get("/api/works/1/editions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("totalEditions", 0);
  });
});

describe("GET /api/works/:id/listings", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/works/bad/listings");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid work id/i);
  });

  it("returns listings for a valid work id", async () => {
    const listings = [
      { id: 1, title: "Dune", userId: 2, workId: 5, status: "for-sale", condition: "good", price: 10 },
    ];
    pushDbResults(listings);
    const res = await request(app).get("/api/works/5/listings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/works/resolve (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/works/resolve")
      .send({ title: "Dune", author: "Frank Herbert" });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Catalog routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/catalog/:id", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await request(app).get("/api/catalog/notanumber");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid catalog id/i);
  });

  it("returns 404 when the catalog entry does not exist", async () => {
    pushDbResults([]); // catalog entry query returns empty
    const res = await request(app).get("/api/catalog/999");
    expect(res.status).toBe(404);
  });

  it("returns the catalog entry with listings on success", async () => {
    const entry = {
      id: 5,
      title: "1984",
      author: "George Orwell",
      language: "English",
    };
    pushDbResults([entry]); // catalog entry
    pushDbResults([]);       // listings
    const res = await request(app).get("/api/catalog/5");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("1984");
    expect(res.body).toHaveProperty("listings");
  });

  it("returns 500 when the database throws", async () => {
    dbCallQueue.push({ then: (_: any, rej: any) => rej(new Error("DB error")) });
    const res = await request(app).get("/api/catalog/1");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to fetch catalog entry/i);
  });
});

describe("GET /api/catalog/stats", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns total, verified, and language distribution", async () => {
    pushDbResults([{ count: 42 }]);         // total count
    pushDbResults([{ count: 10 }]);         // verified count
    pushDbResults([                         // language distribution
      { language: "English", count: 30 },
      { language: "Russian", count: 12 },
    ]);
    const res = await request(app).get("/api/catalog/stats");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(42);
    expect(res.body.verified).toBe(10);
    expect(Array.isArray(res.body.languageDistribution)).toBe(true);
  });

  it("returns 500 when the database throws", async () => {
    // Use a lazy thenable to avoid unhandled rejection warnings
    dbCallQueue.push({ then: (_: any, rej: any) => rej(new Error("DB error")) });
    const res = await request(app).get("/api/catalog/stats");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to fetch catalog stats/i);
  });
});

describe("GET /api/genres", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns a sorted, deduplicated array of genres", async () => {
    pushDbResults([
      { genre: "Science Fiction" },
      { genre: "Fantasy, Science Fiction" },
    ]); // work genres
    pushDbResults([
      { genre: "Fiction" },
      { genre: "Fantasy" },
    ]); // book genres
    const res = await request(app).get("/api/genres");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Deduplication: "Fantasy" from both sources should appear once
    const fantasy = res.body.filter((g: string) => g === "Fantasy");
    expect(fantasy).toHaveLength(1);
    // Result should be sorted
    const sorted = [...res.body].sort((a: string, b: string) => a.localeCompare(b));
    expect(res.body).toEqual(sorted);
  });

  it("returns an empty array when no genres exist", async () => {
    pushDbResults([]); // work genres
    pushDbResults([]); // book genres
    const res = await request(app).get("/api/genres");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 500 when the database throws", async () => {
    dbCallQueue.push({ then: (_: any, rej: any) => rej(new Error("DB error")) });
    const res = await request(app).get("/api/genres");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/failed to fetch genres/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Messages — additional auth-required routes
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/messages/unread/count (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/messages/unread/count");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/messages/:userId (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/messages/5");
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Offers — update route
// ──────────────────────────────────────────────────────────────────────────

describe("PATCH /api/offers/:id (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .patch("/api/offers/1")
      .send({ status: "accepted" });
    expect(res.status).toBe(401);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Payment action routes (all require auth)
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/payments/checkout (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/payments/checkout")
      .send({ bookId: 1 });
    expect(res.status).toBe(401);
  });

  it("creates a payment intent and returns it when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(createPaymentIntent).mockResolvedValueOnce({
      clientSecret: "pi_test_secret",
      transactionId: 7,
    } as any);

    const res = await agent.post("/api/payments/checkout").send({ bookId: 3 });
    expect(res.status).toBe(200);
    expect(res.body.clientSecret).toBe("pi_test_secret");
    expect(res.body.transactionId).toBe(7);
  });

  it("returns 400 when checkout fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(createPaymentIntent).mockRejectedValueOnce(new Error("Book not available"));

    const res = await agent.post("/api/payments/checkout").send({ bookId: 3 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Book not available/);
  });

  it("returns 400 when bookId is missing", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/checkout").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/payments/:id/confirm (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/payments/1/confirm");
    expect(res.status).toBe(401);
  });

  it("confirms payment and returns result when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(confirmPayment).mockResolvedValueOnce({ id: 1, status: "confirmed" } as any);

    const res = await agent.post("/api/payments/1/confirm");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
  });

  it("returns 400 for a non-numeric transaction id", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/abc/confirm");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid transaction ID/i);
  });

  it("returns 400 when confirmation fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(confirmPayment).mockRejectedValueOnce(new Error("Not authorized"));

    const res = await agent.post("/api/payments/1/confirm");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Not authorized/);
  });
});

describe("POST /api/payments/:id/ship (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/payments/1/ship");
    expect(res.status).toBe(401);
  });

  it("marks shipment and returns result when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(markShipped).mockResolvedValueOnce({ id: 1, status: "shipped" } as any);

    const res = await agent.post("/api/payments/1/ship").send({
      carrier: "USPS",
      trackingNumber: "9400111899220400000000",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("shipped");
  });

  it("returns 400 for a non-numeric transaction id", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/xyz/ship");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid transaction ID/i);
  });

  it("returns 400 when marking shipped fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(markShipped).mockRejectedValueOnce(new Error("Only seller can mark shipped"));

    const res = await agent.post("/api/payments/1/ship").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only seller/);
  });
});

describe("POST /api/payments/:id/deliver (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/payments/1/deliver");
    expect(res.status).toBe(401);
  });

  it("confirms delivery and returns result when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(confirmDelivery).mockResolvedValueOnce({ id: 1, status: "delivered" } as any);

    const res = await agent.post("/api/payments/1/deliver");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("delivered");
  });

  it("returns 400 for a non-numeric transaction id", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/abc/deliver");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid transaction ID/i);
  });

  it("returns 400 when delivery confirmation fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(confirmDelivery).mockRejectedValueOnce(new Error("Only buyer can confirm"));

    const res = await agent.post("/api/payments/1/deliver");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only buyer/);
  });
});

describe("GET /api/payments/transactions (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/payments/transactions");
    expect(res.status).toBe(401);
  });

  it("returns the transaction list for the authenticated user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const txns = [{ id: 1, status: "delivered", buyerId: TEST_USER.id }];
    vi.mocked(getUserTransactions).mockResolvedValueOnce(txns as any);

    const res = await agent.get("/api/payments/transactions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(1);
  });

  it("returns 500 when fetching transactions fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(getUserTransactions).mockRejectedValueOnce(new Error("DB error"));

    const res = await agent.get("/api/payments/transactions");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Failed to fetch transactions/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Seller onboarding routes (all require auth)
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/seller/connect (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).post("/api/seller/connect").send({});
    expect(res.status).toBe(401);
  });

  it("creates a seller account and returns the result when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(createSellerAccount).mockResolvedValueOnce({ url: "https://connect.stripe.com/setup" } as any);

    const res = await agent.post("/api/seller/connect").send({ returnUrl: "https://example.com/dashboard" });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://connect.stripe.com/setup");
  });

  it("returns 400 when creating a seller account fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(createSellerAccount).mockRejectedValueOnce(new Error("Stripe error"));

    const res = await agent.post("/api/seller/connect").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Stripe error/);
  });
});

describe("GET /api/seller/status (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/seller/status");
    expect(res.status).toBe(401);
  });

  it("returns seller status when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(checkSellerStatus).mockResolvedValueOnce({ onboarded: true, accountId: "acct_123" } as any);

    const res = await agent.get("/api/seller/status");
    expect(res.status).toBe(200);
    expect(res.body.onboarded).toBe(true);
  });

  it("returns 400 when checking status fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(checkSellerStatus).mockRejectedValueOnce(new Error("No account found"));

    const res = await agent.get("/api/seller/status");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No account found/);
  });
});

describe("GET /api/seller/connect/complete (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/seller/connect/complete");
    expect(res.status).toBe(401);
  });

  it("returns updated seller status when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(checkSellerStatus).mockResolvedValueOnce({ onboarded: true, accountId: "acct_123" } as any);

    const res = await agent.get("/api/seller/connect/complete");
    expect(res.status).toBe(200);
    expect(res.body.onboarded).toBe(true);
  });

  it("returns 400 when status check fails", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(checkSellerStatus).mockRejectedValueOnce(new Error("Account error"));

    const res = await agent.get("/api/seller/connect/complete");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Account error/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Catalog listing route (GET /api/catalog)
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/catalog", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns empty books array and total 0 when catalog is empty", async () => {
    pushDbResults([]);           // catalog rows
    pushDbResults([{ count: 0 }]); // count query
    const res = await request(app).get("/api/catalog");
    expect(res.status).toBe(200);
    expect(res.body.books).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("returns catalog entries with total", async () => {
    const entries = [
      { id: 1, title: "1984", author: "George Orwell", language: "English" },
      { id: 2, title: "Brave New World", author: "Aldous Huxley", language: "English" },
    ];
    pushDbResults(entries);
    pushDbResults([{ count: 2 }]);
    const res = await request(app).get("/api/catalog");
    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(2);
    expect(res.body.total).toBe(2);
    expect(res.body.books[0].title).toBe("1984");
  });

  it("respects the limit query param (capped at 100)", async () => {
    pushDbResults([]);
    pushDbResults([{ count: 200 }]);
    const res = await request(app).get("/api/catalog?limit=5");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(200);
  });

  it("supports page-based pagination", async () => {
    pushDbResults([]);
    pushDbResults([{ count: 50 }]);
    const res = await request(app).get("/api/catalog?page=3&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(50);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Catalog search route (GET /api/catalog/search)
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/catalog/search", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns empty results and total 0 when no query given", async () => {
    pushDbResults([]);
    pushDbResults([{ count: 0 }]);
    const res = await request(app).get("/api/catalog/search");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("returns empty results when query is a single character (< 2 chars)", async () => {
    pushDbResults([]);
    pushDbResults([{ count: 0 }]);
    const res = await request(app).get("/api/catalog/search?q=a");
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([]);
  });

  it("returns results and total for a valid query", async () => {
    const entries = [
      { id: 5, title: "War and Peace", author: "Leo Tolstoy", language: "English" },
    ];
    pushDbResults(entries);
    pushDbResults([{ count: 1 }]);
    const res = await request(app).get("/api/catalog/search?q=war");
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].title).toBe("War and Peace");
  });

  it("exposes limit and offset in the response envelope", async () => {
    pushDbResults([]);
    pushDbResults([{ count: 0 }]);
    const res = await request(app).get("/api/catalog/search?q=book&limit=5&offset=10");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
    expect(res.body.offset).toBe(10);
  });

  it("filters by language when the language param is provided", async () => {
    const entries = [
      { id: 3, title: "Война и мир", author: "Толстой", language: "Russian" },
    ];
    pushDbResults(entries);
    pushDbResults([{ count: 1 }]);
    const res = await request(app).get("/api/catalog/search?language=Russian");
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].language).toBe("Russian");
  });

  it("clamps limit to 100 even when a larger value is requested", async () => {
    pushDbResults([]);
    pushDbResults([{ count: 0 }]);
    const res = await request(app).get("/api/catalog/search?limit=500");
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// ISBN lookup route (GET /api/search/isbn/:isbn)
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/search/isbn/:isbn", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 404 when the ISBN is not found in Open Library", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const res = await request(app).get("/api/search/isbn/9780141439518");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns formatted book data when the ISBN is found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          "ISBN:9780141439518": {
            title: "Pride and Prejudice",
            authors: [{ name: "Jane Austen" }],
            publish_date: "1813",
            publishers: [{ name: "T. Egerton" }],
            cover: { large: "https://example.com/cover.jpg" },
            subjects: [{ name: "Fiction" }, { name: "Romance" }],
            number_of_pages: 432,
          },
        }),
      }),
    );
    const res = await request(app).get("/api/search/isbn/9780141439518");
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Pride and Prejudice");
    expect(res.body.author).toBe("Jane Austen");
    expect(res.body.year).toBe(1813);
    expect(res.body.isbn).toBe("9780141439518");
    expect(res.body.coverUrl).toBe("https://example.com/cover.jpg");
    expect(res.body.pages).toBe(432);
  });

  it("returns 500 when the fetch call throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    const res = await request(app).get("/api/search/isbn/9780141439518");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/isbn lookup failed/i);
  });

  it("strips non-numeric characters from the isbn param", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    await request(app).get("/api/search/isbn/978-0-14-143951-8");
    // The fetch URL should contain the cleaned ISBN (digits only)
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("9780141439518");
    expect(calledUrl).not.toContain("-");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Open Library book search (GET /api/search/books) — with results
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/search/books — with mocked Open Library response", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns mapped results from Open Library for a valid query", async () => {
    const olResponse = {
      docs: [
        {
          title: "Dune",
          author_name: ["Frank Herbert"],
          first_publish_year: 1965,
          publisher: ["Chilton Books"],
          isbn: ["9780441013593"],
          cover_i: 8765432,
          edition_count: 30,
          subject: ["Science fiction", "Desert planets", "Sand worms", "Spice", "Arrakis"],
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => olResponse }),
    );
    const res = await request(app).get("/api/search/books?q=dune");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Dune");
    expect(res.body[0].author).toBe("Frank Herbert");
    expect(res.body[0].year).toBe(1965);
    expect(res.body[0].isbn).toBe("9780441013593");
    expect(res.body[0].editionCount).toBe(30);
    expect(res.body[0].coverUrl).toContain("8765432");
    // subjects are sliced to max 5
    expect(res.body[0].subjects).toHaveLength(5);
  });

  it("returns 500 when the Open Library fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    const res = await request(app).get("/api/search/books?q=somebook");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/search failed/i);
  });

  it("returns an empty array when Open Library returns no docs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ docs: [] }) }),
    );
    const res = await request(app).get("/api/search/books?q=xyznotabook");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Shared fixture for authenticated-route tests
// ──────────────────────────────────────────────────────────────────────────

const TEST_USER = {
  id: 42,
  username: "tester",
  displayName: "Test User",
  email: "tester@example.com",
  password: "$2b$12$mockedhash",
  bio: null,
  avatarUrl: null,
  location: null,
  rating: 0,
  totalSales: 0,
  totalPurchases: 0,
  role: "user",
  stripeAccountId: null,
  stripeOnboarded: false,
  createdAt: new Date(),
};

// ──────────────────────────────────────────────────────────────────────────
// POST /api/books — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/books — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("creates a book and returns it when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const createdBook = {
      id: 10,
      userId: TEST_USER.id,
      title: "Clean Code",
      author: "Robert Martin",
      condition: "good",
      status: "for-sale",
      price: 15,
    };
    mockStorage.createBook.mockResolvedValueOnce(createdBook);

    const res = await agent.post("/api/books").send({
      title: "Clean Code",
      author: "Robert Martin",
      condition: "good",
      status: "for-sale",
      price: 15,
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Clean Code");
    expect(res.body.id).toBe(10);
  });

  it("returns 400 for invalid book data when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/books").send({
      // missing required 'title' and 'author'
      condition: "good",
      status: "for-sale",
    });

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/books/:id — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("PATCH /api/books/:id — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("updates a book and returns it when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const updatedBook = { id: 5, title: "Updated Title", author: "Author" };
    mockStorage.updateBook.mockResolvedValueOnce(updatedBook);

    const res = await agent.patch("/api/books/5").send({ title: "Updated Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Title");
  });

  it("returns 404 when the book is not found or not owned by the user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.updateBook.mockResolvedValueOnce(undefined);

    const res = await agent.patch("/api/books/999").send({ title: "X" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/books/:id — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("DELETE /api/books/:id — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("deletes a book and returns a success message when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.deleteBook.mockResolvedValueOnce(true);

    const res = await agent.delete("/api/books/5");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it("returns 404 when the book is not found or not owned by the user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.deleteBook.mockResolvedValueOnce(false);

    const res = await agent.delete("/api/books/999");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/requests — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/requests — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("creates a book request and returns it when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const newRequest = { id: 7, userId: TEST_USER.id, title: "Dune", status: "open" };
    mockStorage.createBookRequest.mockResolvedValueOnce(newRequest);

    const res = await agent.post("/api/requests").send({ title: "Dune" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Dune");
  });

  it("returns 400 when title is missing", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/requests").send({});
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("PATCH /api/requests/:id — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("updates a book request when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const updated = { id: 7, title: "Dune Messiah", status: "open" };
    mockStorage.updateBookRequest.mockResolvedValueOnce(updated);

    const res = await agent.patch("/api/requests/7").send({ title: "Dune Messiah" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Dune Messiah");
  });

  it("returns 404 when the request is not found or not owned", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.updateBookRequest.mockResolvedValueOnce(undefined);

    const res = await agent.patch("/api/requests/999").send({ title: "X" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns 400 for a non-numeric request id", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.patch("/api/requests/notanid").send({ title: "X" });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/messages — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/messages — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns conversations for the authenticated user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const conversations = [
      { otherUserId: 1, otherUsername: "alice", lastMessage: "Hi" },
    ];
    mockStorage.getConversations.mockResolvedValueOnce(conversations);

    const res = await agent.get("/api/messages");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].otherUsername).toBe("alice");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/messages/unread/count — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/messages/unread/count — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns the unread message count for the authenticated user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.getUnreadCount.mockResolvedValueOnce(3);

    const res = await agent.get("/api/messages/unread/count");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/messages/:userId — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/messages/:userId — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns the message thread with another user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const msgs = [{ id: 1, content: "Hello!", senderId: TEST_USER.id }];
    mockStorage.getMessages.mockResolvedValueOnce(msgs);
    mockStorage.markMessagesRead.mockResolvedValueOnce(undefined);

    const res = await agent.get("/api/messages/7");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].content).toBe("Hello!");
  });

  it("returns 400 for a non-numeric userId", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.get("/api/messages/notanid");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/messages — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/messages — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("sends a message and returns it when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER); // passport deserializeUser
    mockStorage.getUser.mockResolvedValueOnce({ id: 7, username: "other" }); // receiver validation

    const msg = { id: 99, content: "Hey there", senderId: TEST_USER.id, receiverId: 7 };
    mockStorage.createMessage.mockResolvedValueOnce(msg);

    const res = await agent.post("/api/messages").send({ receiverId: 7, content: "Hey there" });
    expect(res.status).toBe(200);
    expect(res.body.content).toBe("Hey there");
  });

  it("returns 400 when content is empty", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/messages").send({ receiverId: 7, content: "" });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/offers — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/offers — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns the offer list for the authenticated user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const offers = [{ id: 1, bookId: 5, amount: 10, status: "pending" }];
    mockStorage.getOffers.mockResolvedValueOnce(offers);

    const res = await agent.get("/api/offers");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(10);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/offers — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/offers — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("creates an offer when the book is available", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const book = { id: 5, userId: 99, status: "for-sale", title: "Dune" };
    mockStorage.getBook.mockResolvedValueOnce(book);
    const offer = { id: 1, bookId: 5, amount: 12, status: "pending" };
    mockStorage.createOffer.mockResolvedValueOnce(offer);

    const res = await agent.post("/api/offers").send({ bookId: 5, amount: 12 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(12);
  });

  it("returns 404 when the book does not exist", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.getBook.mockResolvedValueOnce(undefined);

    const res = await agent.post("/api/offers").send({ bookId: 999, amount: 10 });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns 400 when the user tries to make an offer on their own book", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    // Book belongs to the authenticated user (TEST_USER.id === book.userId)
    const book = { id: 5, userId: TEST_USER.id, status: "for-sale", title: "My Book" };
    mockStorage.getBook.mockResolvedValueOnce(book);

    const res = await agent.post("/api/offers").send({ bookId: 5, amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/own book/i);
  });

  it("returns 400 when the book is not accepting offers", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const book = { id: 5, userId: 99, status: "not-for-sale", title: "Rare Book" };
    mockStorage.getBook.mockResolvedValueOnce(book);

    const res = await agent.post("/api/offers").send({ bookId: 5, amount: 10 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not accepting/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/offers/:id — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("PATCH /api/offers/:id — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("updates an offer status when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const updatedOffer = { id: 1, bookId: 5, amount: 10, status: "accepted" };
    mockStorage.updateOffer.mockResolvedValueOnce(updatedOffer);

    const res = await agent.patch("/api/offers/1").send({ status: "accepted" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("accepted");
  });

  it("returns 404 when the offer is not found or not owned", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.updateOffer.mockResolvedValueOnce(undefined);

    const res = await agent.patch("/api/offers/999").send({ status: "declined" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/works/resolve — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/works/resolve — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("resolves a work and returns the result when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent
      .post("/api/works/resolve")
      .send({ title: "Dune", author: "Frank Herbert" });

    expect(res.status).toBe(200);
    // The mocked resolveWork returns { workId: 1, isNew: false, confidence: "high" }
    expect(res.body.workId).toBe(1);
    expect(res.body.confidence).toBe("high");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PATCH /api/users/me — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("PATCH /api/users/me (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).patch("/api/users/me").send({ displayName: "New Name" });
    expect(res.status).toBe(401);
  });

  it("updates the user profile and returns it (without password) when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const updated = { ...TEST_USER, displayName: "Updated Name", bio: "Hello!" };
    mockStorage.updateUser.mockResolvedValueOnce(updated);

    const res = await agent.patch("/api/users/me").send({ displayName: "Updated Name", bio: "Hello!" });
    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Updated Name");
    expect(res.body.bio).toBe("Hello!");
    expect(res.body.password).toBeUndefined();
  });

  it("returns 404 when the user is not found", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.updateUser.mockResolvedValueOnce(undefined);

    const res = await agent.patch("/api/users/me").send({ displayName: "Updated Name" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/User not found/i);
  });

  it("returns 400 when an invalid avatarUrl is supplied", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.patch("/api/users/me").send({ avatarUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("accepts an empty string avatarUrl (clears the avatar)", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const updated = { ...TEST_USER, avatarUrl: "" };
    mockStorage.updateUser.mockResolvedValueOnce(updated);

    const res = await agent.patch("/api/users/me").send({ avatarUrl: "" });
    expect(res.status).toBe(200);
    expect(res.body.avatarUrl).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/change-password (requires auth)", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "old", newPassword: "new" });
    expect(res.status).toBe(401);
  });

  it("changes the password successfully when current password is correct", async () => {
    const agent = await loginAs(app, TEST_USER);
    // deserializeUser
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);
    // getUser inside the handler
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as any);
    mockStorage.updateUser.mockResolvedValueOnce({ ...TEST_USER, password: "$2b$12$newhash" });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "OldPassword1!",
      newPassword: "NewPassword1!",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Password updated/i);
  });

  it("returns 400 when the current password is incorrect", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as any);

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "WrongPassword1!",
      newPassword: "NewPassword1!",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Current password is incorrect/i);
  });

  it("returns 400 when the new password fails policy validation", async () => {
    vi.mocked(validatePassword).mockReturnValueOnce({ valid: false, errors: ["Password too weak"] });

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as any);

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "OldPassword1!",
      newPassword: "weak",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Password too weak/i);
  });

  it("returns 400 when required fields are missing", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/auth/change-password").send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when the user cannot be found", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);
    // handler's own getUser call returns nothing
    mockStorage.getUser.mockResolvedValueOnce(undefined);

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "OldPassword1!",
      newPassword: "NewPassword1!",
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/User not found/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/health
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns { status: 'ok', db: 'ok' } when the database is reachable", async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });

  it("returns 503 with { status: 'degraded', db: 'error' } when the database throws", async () => {
    mockPool.query.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.db).toBe("error");
    expect(res.body.error).toMatch(/connection refused/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/forgot-password", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns success message even when email is not registered (avoids user enumeration)", async () => {
    mockStorage.getUserByEmail.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "unknown@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/i);
  });

  it("returns success and a token in dev mode when the email is registered", async () => {
    mockStorage.getUserByEmail.mockResolvedValueOnce({
      id: 1,
      email: "user@example.com",
    });
    // db.update().set().where() resolves with default empty array — result not used
    pushDbResults([]);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/i);
    // In non-production mode the token is returned in the response
    expect(res.body.resetToken).toBeDefined();
    expect(res.body.resetUrl).toMatch(/reset-password/);
  });

  it("returns 400 when email is malformed", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when the body is empty", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({});

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/auth/reset-password", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("resets the password successfully with a valid token", async () => {
    // db.select().from(users).where(...) → user with valid (future) expiry
    pushDbResults([
      {
        id: 1,
        email: "user@example.com",
        passwordResetToken: "validtoken123",
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    ]);
    // db.update(users).set().where() → not used
    pushDbResults([]);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "validtoken123", password: "NewSecurePass1!" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password has been reset/i);
  });

  it("returns 400 when the token is not found in the database", async () => {
    // db.select() returns empty array — no matching user
    pushDbResults([]);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "badtoken", password: "NewSecurePass1!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it("returns 400 when the reset token has expired", async () => {
    pushDbResults([
      {
        id: 1,
        passwordResetToken: "expiredtoken",
        passwordResetExpiry: new Date(Date.now() - 1000), // already expired
      },
    ]);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "expiredtoken", password: "NewSecurePass1!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or has expired/i);
  });

  it("returns 400 when the new password fails policy validation", async () => {
    vi.mocked(validatePassword).mockReturnValueOnce({ valid: false, errors: ["Password too weak"] });

    pushDbResults([
      {
        id: 1,
        passwordResetToken: "validtoken123",
        passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    ]);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "validtoken123", password: "NewSecurePass1!" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Password too weak/);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({});

    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/transactions/:id/rate — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/transactions/:id/rate — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/transactions/1/rate")
      .send({ rating: 5 });

    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric transaction id", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/transactions/abc/rate").send({ rating: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid transaction ID/i);
  });

  it("returns 404 when the transaction does not exist", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([]); // select returns no rows

    const res = await agent.post("/api/transactions/99/rate").send({ rating: 5 });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns 403 when the authenticated user is not the buyer", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, buyerId: 999, sellerId: 5, status: "completed", buyerRating: null }]);

    const res = await agent.post("/api/transactions/1/rate").send({ rating: 4 });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only the buyer/i);
  });

  it("returns 400 when the transaction is not yet completed", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, buyerId: TEST_USER.id, sellerId: 5, status: "pending", buyerRating: null }]);

    const res = await agent.post("/api/transactions/1/rate").send({ rating: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Can only rate completed/i);
  });

  it("returns 400 when the buyer has already rated the transaction", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, buyerId: TEST_USER.id, sellerId: 5, status: "completed", buyerRating: 4 }]);

    const res = await agent.post("/api/transactions/1/rate").send({ rating: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already rated/i);
  });

  it("submits the rating and returns confirmation when all conditions are met", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    // select(transactions) → tx, update(transactions) → ignored,
    // select(users) → seller, update(users) → ignored
    pushDbResults(
      [{ id: 1, buyerId: TEST_USER.id, sellerId: 5, status: "completed", buyerRating: null }],
      [],
      [{ id: 5, rating: 4, ratingCount: 2 }],
      [],
    );

    const res = await agent.post("/api/transactions/1/rate").send({ rating: 5 });
    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(5);
    expect(res.body.message).toMatch(/Rating submitted/i);
  });

  it("returns 400 when the rating value is out of range", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/transactions/1/rate").send({ rating: 6 });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DELETE /api/requests/:id — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("DELETE /api/requests/:id — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).delete("/api/requests/1");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric request id", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.delete("/api/requests/notanid");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid request ID/i);
  });

  it("returns 404 when the request is not found or not owned by the user", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.deleteBookRequest.mockResolvedValueOnce(false);

    const res = await agent.delete("/api/requests/999");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found or not yours/i);
  });

  it("deletes the request and returns a success message when authenticated", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.deleteBookRequest.mockResolvedValueOnce(true);

    const res = await agent.delete("/api/requests/7");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Request deleted/i);
  });

  it("returns 500 when deleteBookRequest throws", async () => {
    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    mockStorage.deleteBookRequest.mockRejectedValueOnce(new Error("DB error"));

    const res = await agent.delete("/api/requests/7");
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Failed to delete request/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// GET /api/payments/paypal/status
// ──────────────────────────────────────────────────────────────────────────

describe("GET /api/payments/paypal/status", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/payments/paypal/status");
    expect(res.status).toBe(401);
  });

  it("returns { enabled: false } when PayPal is disabled", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(false);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.get("/api/payments/paypal/status");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it("returns { enabled: true } when PayPal is enabled", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.get("/api/payments/paypal/status");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/payments/paypal/create-order — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/payments/paypal/create-order — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .send({ bookId: 1 });
    expect(res.status).toBe(401);
  });

  it("returns 503 when PayPal is not enabled", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(false);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/paypal/create-order").send({ bookId: 1 });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/PayPal payments are not enabled/i);
  });

  it("returns 400 when bookId is missing", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/paypal/create-order").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bookId is required/i);
  });

  it("returns 404 when book does not exist", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([]); // db.select() returns no book

    const res = await agent.post("/api/payments/paypal/create-order").send({ bookId: 99 });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Book not found/i);
  });

  it("returns 400 when the book has no price", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, userId: 99, price: null }]);

    const res = await agent.post("/api/payments/paypal/create-order").send({ bookId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Book has no price/i);
  });

  it("returns 400 when the buyer is also the seller", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, userId: TEST_USER.id, price: 10.0 }]);

    const res = await agent.post("/api/payments/paypal/create-order").send({ bookId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot buy your own book/i);
  });

  it("creates a PayPal order and returns orderId and approveUrl on success", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, userId: 99, price: 15.0 }]);

    vi.mocked(createPayPalOrder).mockResolvedValueOnce({
      orderId: "ORDER123",
      approveUrl: "https://paypal.com/approve/ORDER123",
    });

    const res = await agent.post("/api/payments/paypal/create-order").send({ bookId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe("ORDER123");
    expect(res.body.approveUrl).toBe("https://paypal.com/approve/ORDER123");
  });

  it("returns 500 when createPayPalOrder throws", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    pushDbResults([{ id: 1, userId: 99, price: 15.0 }]);

    vi.mocked(createPayPalOrder).mockRejectedValueOnce(new Error("PayPal API error"));

    const res = await agent.post("/api/payments/paypal/create-order").send({ bookId: 1 });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/PayPal API error/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// POST /api/payments/paypal/capture-order — authenticated
// ──────────────────────────────────────────────────────────────────────────

describe("POST /api/payments/paypal/capture-order — authenticated", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    dbCallQueue.length = 0;
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/payments/paypal/capture-order")
      .send({ orderId: "ORDER123" });
    expect(res.status).toBe(401);
  });

  it("returns 503 when PayPal is not enabled", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(false);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/paypal/capture-order").send({ orderId: "ORDER123" });
    expect(res.status).toBe(503);
    expect(res.body.message).toMatch(/PayPal payments are not enabled/i);
  });

  it("returns 400 when orderId is missing", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    const res = await agent.post("/api/payments/paypal/capture-order").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/orderId is required/i);
  });

  it("captures the order and returns captureId and status on success", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(capturePayPalOrder).mockResolvedValueOnce({
      captureId: "CAP456",
      status: "COMPLETED",
    });

    const res = await agent.post("/api/payments/paypal/capture-order").send({ orderId: "ORDER123" });
    expect(res.status).toBe(200);
    expect(res.body.captureId).toBe("CAP456");
    expect(res.body.status).toBe("COMPLETED");
  });

  it("returns 500 when capturePayPalOrder throws", async () => {
    vi.mocked(isPayPalEnabled).mockResolvedValueOnce(true);

    const agent = await loginAs(app, TEST_USER);
    mockStorage.getUser.mockResolvedValueOnce(TEST_USER);

    vi.mocked(capturePayPalOrder).mockRejectedValueOnce(new Error("Capture failed"));

    const res = await agent.post("/api/payments/paypal/capture-order").send({ orderId: "ORDER123" });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Capture failed/i);
  });
});

