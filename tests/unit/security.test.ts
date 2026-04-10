import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { sanitizeLikeInput, parseIntParam, stripHtml, validateIdParam, applySecurityMiddleware } from "../../server/security";

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
});
