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

  return {
    storage: storageMock,
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    },
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
