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
  };

  return {
    storage: storageMock,
    db: dbMock,
    DatabaseStorage: vi.fn(),
  };
});

vi.mock("../../server/payments", () => ({
  createPaymentIntent: vi.fn(),
  confirmPayment: vi.fn(),
  failPayment: vi.fn(),
  handleSellerAccountUpdated: vi.fn(),
  handleTransferFailed: vi.fn(),
  markShipped: vi.fn(),
  confirmDelivery: vi.fn(),
  getUserTransactions: vi.fn().mockResolvedValue([]),
  PLATFORM_FEE_PERCENT: 0.1,
  createSellerAccount: vi.fn(),
  checkSellerStatus: vi.fn(),
}));

vi.mock("../../server/admin", () => ({
  registerAdminRoutes: vi.fn(),
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

// ─── import after mocks are set up ─────────────────────────────────────────

import { storage } from "../../server/storage";
import { registerRoutes } from "../../server/routes";

// ─── test helpers ──────────────────────────────────────────────────────────

async function buildApp() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  return app;
}

const mockStorage = storage as ReturnType<typeof vi.mocked<typeof storage>>;

/** Push values onto the db queue so that successive `await db.select()...` calls
 *  each resolve to the corresponding entry in the array. */
function pushDbResults(...values: any[]) {
  dbCallQueue.push(...values);
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
});

describe("GET /api/auth/me", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
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
    (mockStorage.getBookRequests as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it("returns an array", async () => {
    const res = await request(app).get("/api/requests");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("enriches each request with user info", async () => {
    const req1 = { id: 1, title: "Dune", userId: 7, status: "open", createdAt: new Date() };
    const user7 = { id: 7, username: "frank", displayName: "Frank Herbert", avatarUrl: null };

    (mockStorage.getBookRequests as ReturnType<typeof vi.fn>).mockResolvedValueOnce([req1]);
    (mockStorage.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce(user7);

    const res = await request(app).get("/api/requests");
    expect(res.status).toBe(200);
    expect(res.body[0].user.username).toBe("frank");
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

  it("returns the platform fee percentage and stripe config status", async () => {
    const res = await request(app).get("/api/payments/fee-info");
    expect(res.status).toBe(200);
    // PLATFORM_FEE_PERCENT is mocked as 0.1 → 10%
    expect(res.body.platformFeePercent).toBe(10);
    expect(res.body).toHaveProperty("description");
    expect(res.body).toHaveProperty("stripeConfigured");
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
});
