import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { sanitizeLikeInput, parseIntParam, stripHtml, validateIdParam, applySecurityMiddleware, PgRateLimitStore } from "../../server/security";

// ────────────────────────────────────────────────────────────────
// sanitizeLikeInput
// ────────────────────────────────────────────────────────────────

describe("sanitizeLikeInput", () => {
  it("escapes a percent sign", () => {
    expect(sanitizeLikeInput("100%")).toBe("100\\%");
  });

  it("escapes an underscore", () => {
    expect(sanitizeLikeInput("file_name")).toBe("file\\_name");
  });

  it("escapes a backslash", () => {
    expect(sanitizeLikeInput("path\\to")).toBe("path\\\\to");
  });

  it("escapes multiple special characters in one string", () => {
    expect(sanitizeLikeInput("50% off_sale\\here")).toBe(
      "50\\% off\\_sale\\\\here"
    );
  });

  it("returns a plain string unchanged", () => {
    expect(sanitizeLikeInput("Harry Potter")).toBe("Harry Potter");
  });

  it("escapes a string that is just a percent sign", () => {
    expect(sanitizeLikeInput("%")).toBe("\\%");
  });

  it("escapes a string that is just an underscore", () => {
    expect(sanitizeLikeInput("_")).toBe("\\_");
  });

  it("handles an empty string", () => {
    expect(sanitizeLikeInput("")).toBe("");
  });

  it("processes backslash before percent (order matters)", () => {
    // "\\%" → after backslash escape: "\\\\%" → after percent escape: "\\\\\\%"
    expect(sanitizeLikeInput("\\%")).toBe("\\\\\\%");
  });
});

// ────────────────────────────────────────────────────────────────
// parseIntParam
// ────────────────────────────────────────────────────────────────

describe("parseIntParam", () => {
  it("parses a valid positive integer string", () => {
    expect(parseIntParam("42")).toBe(42);
  });

  it("parses '0' as 0", () => {
    expect(parseIntParam("0")).toBe(0);
  });

  it("returns null for undefined input", () => {
    expect(parseIntParam(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseIntParam("")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseIntParam("abc")).toBeNull();
  });

  it("returns null for a negative number", () => {
    expect(parseIntParam("-1")).toBeNull();
  });

  it("uses the first element when passed an array", () => {
    expect(parseIntParam(["7", "99"])).toBe(7);
  });

  it("returns null for an array whose first element is invalid", () => {
    expect(parseIntParam(["abc", "1"])).toBeNull();
  });

  it("returns null for NaN input", () => {
    expect(parseIntParam("NaN")).toBeNull();
  });

  it("returns null for Infinity string", () => {
    // parseInt('Infinity', 10) returns NaN
    expect(parseIntParam("Infinity")).toBeNull();
  });

  it("truncates float strings to their integer part", () => {
    // parseInt("3.9") === 3 which is ≥ 0
    expect(parseIntParam("3.9")).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────
// stripHtml
// ────────────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("removes a simple HTML tag", () => {
    expect(stripHtml("<b>bold</b>")).toBe("bold");
  });

  it("removes a script tag", () => {
    expect(stripHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it("removes multiple tags", () => {
    expect(stripHtml("<h1>Title</h1><p>Body</p>")).toBe("TitleBody");
  });

  it("returns a plain string unchanged", () => {
    expect(stripHtml("Hello, world!")).toBe("Hello, world!");
  });

  it("handles an empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("removes self-closing tags", () => {
    expect(stripHtml("Line1<br/>Line2")).toBe("Line1Line2");
  });

  it("removes tags with attributes", () => {
    expect(stripHtml('<a href="http://example.com">link</a>')).toBe("link");
  });

  it("handles nested tags", () => {
    expect(stripHtml("<div><span>text</span></div>")).toBe("text");
  });

  it("does not strip angle brackets that are not tags", () => {
    // "5 > 3" has no valid HTML tag syntax
    expect(stripHtml("5 > 3 and 1 < 2")).toBe("5 > 3 and 1 < 2");
  });
});

// ────────────────────────────────────────────────────────────────
// validateIdParam
// ────────────────────────────────────────────────────────────────

describe("validateIdParam", () => {
  function makeRes() {
    const res = { status: vi.fn(), json: vi.fn() } as any;
    res.status.mockReturnValue(res);
    return res;
  }

  it("calls next() for a valid positive integer id", () => {
    const req = { params: { id: "42" } } as any;
    const res = makeRes();
    const next = vi.fn();
    validateIdParam(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-numeric id", () => {
    const req = { params: { id: "abc" } } as any;
    const res = makeRes();
    const next = vi.fn();
    validateIdParam(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid ID" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for a negative id", () => {
    const req = { params: { id: "-5" } } as any;
    const res = makeRes();
    const next = vi.fn();
    validateIdParam(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when id is undefined", () => {
    const req = { params: {} } as any;
    const res = makeRes();
    const next = vi.fn();
    validateIdParam(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when id is '1'", () => {
    const req = { params: { id: "1" } } as any;
    const res = makeRes();
    const next = vi.fn();
    validateIdParam(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() for a float string that parses to 0 (edge case)", () => {
    // parseInt("0.5") = 0 which is ≥ 0, so parseIntParam returns 0.
    // validateIdParam checks id === null; since 0 !== null it calls next().
    const req = { params: { id: "0.5" } } as any;
    const res = makeRes();
    const next = vi.fn();
    validateIdParam(req, res, next);
    // parseInt("0.5") = 0, not null, so next is called
    expect(next).toHaveBeenCalledOnce();
  });
});

// ────────────────────────────────────────────────────────────────
// applySecurityMiddleware
// ────────────────────────────────────────────────────────────────

describe("applySecurityMiddleware", () => {
  it("registers middleware without throwing", () => {
    const app = express();
    expect(() => applySecurityMiddleware(app)).not.toThrow();
  });

  it("adds Helmet security headers (X-Content-Type-Options) to responses", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    // Helmet sets this header on every response
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("adds X-Frame-Options header to responses", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("applies rate limiting to /api/auth/login (returns 429 after limit exceeded)", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));

    // Fire 11 requests — the 11th should hit the 10-request auth limit
    let lastStatus = 200;
    for (let i = 0; i < 11; i++) {
      const res = await request(app).post("/api/auth/login").send({});
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("keeps /api/auth/login under the dedicated auth limiter (limit=10)", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));

    const res = await request(app).post("/api/auth/login").send({});
    expect(res.headers["ratelimit-limit"]).toBe("10");
  });

  it("keeps non-special API routes under the general API limiter (limit=100)", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.get("/api/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/api/ping");
    expect(res.headers["ratelimit-limit"]).toBe("100");
  });
});

// ────────────────────────────────────────────────────────────────
// applySecurityMiddleware — production mode
// ────────────────────────────────────────────────────────────────

describe("applySecurityMiddleware (production mode)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("applies a Content-Security-Policy header in production mode", async () => {
    process.env.NODE_ENV = "production";
    const app = express();
    applySecurityMiddleware(app);
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    expect(res.headers["content-security-policy"]).toBeDefined();
    // The production CSP must restrict script-src to known origins
    expect(res.headers["content-security-policy"]).toMatch(/script-src/);
  });

  it("does not set a Content-Security-Policy header in development mode", async () => {
    process.env.NODE_ENV = "development";
    const app = express();
    applySecurityMiddleware(app);
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    // Helmet with contentSecurityPolicy: false should not emit the header
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("sets Strict-Transport-Security header in production mode", async () => {
    process.env.NODE_ENV = "production";
    const app = express();
    applySecurityMiddleware(app);
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    const hsts = res.headers["strict-transport-security"];
    expect(hsts).toBeDefined();
    // Must include max-age of at least 1 year and includeSubDomains
    expect(hsts).toMatch(/max-age=31536000/);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it("does not set Strict-Transport-Security header in development mode", async () => {
    process.env.NODE_ENV = "development";
    const app = express();
    applySecurityMiddleware(app);
    app.get("/ping", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/ping");
    // Helmet only emits HSTS in production (our code passes hsts: false in the dev helmet call)
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────
// PgRateLimitStore
// ────────────────────────────────────────────────────────────────

describe("PgRateLimitStore", () => {
  function makeMockPool(overrides?: Partial<{ query: ReturnType<typeof vi.fn> }>) {
    return {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      ...overrides,
    } as any;
  }

  it("increment creates the rate_limits table on first use", async () => {
    const resetTime = new Date();
    const pool = makeMockPool({
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })          // CREATE TABLE
        .mockResolvedValueOnce({ rows: [{ hits: "1", reset_time: resetTime }] }), // INSERT
    });
    const store = new PgRateLimitStore(pool, 60_000);
    await store.increment("ip::1.2.3.4");

    const calls = pool.query.mock.calls as any[][];
    expect(calls[0][0]).toMatch(/CREATE TABLE IF NOT EXISTS rate_limits/);
  });

  it("increment returns parsed totalHits and resetTime", async () => {
    const resetTime = new Date(Date.now() + 60_000);
    const pool = makeMockPool({
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })          // CREATE TABLE
        .mockResolvedValueOnce({ rows: [{ hits: "3", reset_time: resetTime }] }), // INSERT
    });
    const store = new PgRateLimitStore(pool, 60_000);
    const result = await store.increment("ip::1.2.3.4");

    expect(result.totalHits).toBe(3);
    expect(result.resetTime).toEqual(resetTime);
  });

  it("ensureTable is only called once even when increment is called multiple times", async () => {
    const resetTime = new Date();
    const pool = makeMockPool({
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [] })          // CREATE TABLE — called once
        .mockResolvedValue({ rows: [{ hits: "1", reset_time: resetTime }] }), // INSERT — called each time
    });
    const store = new PgRateLimitStore(pool, 60_000);
    await store.increment("key-a");
    await store.increment("key-b");

    const tableCreationCalls = (pool.query.mock.calls as any[][]).filter((args) =>
      typeof args[0] === "string" && args[0].includes("CREATE TABLE IF NOT EXISTS"),
    );
    expect(tableCreationCalls).toHaveLength(1);
  });

  it("decrement issues an UPDATE query that decrements the hit counter", async () => {
    const pool = makeMockPool();
    const store = new PgRateLimitStore(pool, 60_000);
    await store.decrement("ip::1.2.3.4");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE rate_limits"),
      ["ip::1.2.3.4"],
    );
    expect(pool.query.mock.calls[0][0]).toMatch(/GREATEST\(hits - 1, 0\)/);
  });

  it("resetKey issues a DELETE query for the given key", async () => {
    const pool = makeMockPool();
    const store = new PgRateLimitStore(pool, 60_000);
    await store.resetKey("ip::1.2.3.4");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM rate_limits"),
      ["ip::1.2.3.4"],
    );
  });

  it("resetAll issues a TRUNCATE query", async () => {
    const pool = makeMockPool();
    const store = new PgRateLimitStore(pool, 60_000);
    await store.resetAll();

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("TRUNCATE rate_limits"),
    );
  });

  it("uses PgRateLimitStore when applySecurityMiddleware is called in production mode with a pool", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const resetTime = new Date(Date.now() + 60_000);
      const pool = makeMockPool({
        query: vi.fn().mockResolvedValue({ rows: [{ hits: "1", reset_time: resetTime }] }),
      });

      const app = express();
      applySecurityMiddleware(app, pool);
      app.post("/api/auth/login", (_req, res) => res.json({ ok: true }));

      // Include the CSRF header so the request passes the CSRF middleware and
      // reaches the rate-limiter (which is what this test exercises).
      await request(app)
        .post("/api/auth/login")
        .set("X-App-CSRF", "1")
        .send({});

      // The pool was queried — CREATE TABLE + INSERT for rate-limit tracking
      expect(pool.query).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

// ────────────────────────────────────────────────────────────────
// CSRF protection
// ────────────────────────────────────────────────────────────────

describe("CSRF protection (production mode)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function makeProductionApp() {
    process.env.NODE_ENV = "production";
    const app = express();
    app.use(express.json());
    applySecurityMiddleware(app);
    return app;
  }

  it("blocks a POST request without the X-App-CSRF header in production", async () => {
    const app = makeProductionApp();
    app.post("/api/books", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .post("/api/books")
      .send({ title: "test" });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("CSRF validation failed");
  });

  it("allows a POST request that carries the X-App-CSRF header in production", async () => {
    const app = makeProductionApp();
    app.post("/api/books", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .post("/api/books")
      .set("X-App-CSRF", "1")
      .send({ title: "test" });

    expect(res.status).toBe(200);
  });

  it("allows GET requests without the X-App-CSRF header (read-only, no CSRF risk)", async () => {
    const app = makeProductionApp();
    app.get("/api/books", (_req, res) => res.json({ ok: true }));

    const res = await request(app).get("/api/books");

    expect(res.status).toBe(200);
  });

  it("blocks PATCH requests without the X-App-CSRF header in production", async () => {
    const app = makeProductionApp();
    app.patch("/api/books/1", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .patch("/api/books/1")
      .send({ title: "updated" });

    expect(res.status).toBe(403);
  });

  it("exempts /api/webhooks/ routes from CSRF checks (external providers)", async () => {
    const app = makeProductionApp();
    app.post("/api/webhooks/stripe", (_req, res) => res.json({ ok: true }));

    // No X-App-CSRF header — simulates a Stripe webhook delivery
    const res = await request(app)
      .post("/api/webhooks/stripe")
      .send({ type: "payment_intent.succeeded" });

    expect(res.status).toBe(200);
  });

  it("does NOT enforce CSRF checks in development mode", async () => {
    process.env.NODE_ENV = "development";
    const app = express();
    app.use(express.json());
    applySecurityMiddleware(app);
    app.post("/api/books", (_req, res) => res.json({ ok: true }));

    // No X-App-CSRF header — should still be allowed in dev
    const res = await request(app)
      .post("/api/books")
      .send({ title: "test" });

    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────
// PayPal payment route rate limiting
// ────────────────────────────────────────────────────────────────

describe("PayPal payment route rate limiting", () => {
  it("applies the payment limiter (max=5) to /api/payments/paypal/create-order", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.post("/api/payments/paypal/create-order", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .post("/api/payments/paypal/create-order")
      .set("X-App-CSRF", "1")
      .send({});

    expect(res.headers["ratelimit-limit"]).toBe("5");
  });

  it("applies the payment limiter (max=5) to /api/payments/paypal/capture-order", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.post("/api/payments/paypal/capture-order", (_req, res) => res.json({ ok: true }));

    const res = await request(app)
      .post("/api/payments/paypal/capture-order")
      .set("X-App-CSRF", "1")
      .send({});

    expect(res.headers["ratelimit-limit"]).toBe("5");
  });

  it("blocks /api/payments/paypal/create-order after 5 attempts per minute", async () => {
    const app = express();
    applySecurityMiddleware(app);
    app.post("/api/payments/paypal/create-order", (_req, res) => res.json({ ok: true }));

    let lastStatus = 200;
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post("/api/payments/paypal/create-order")
        .set("X-App-CSRF", "1")
        .send({});
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
