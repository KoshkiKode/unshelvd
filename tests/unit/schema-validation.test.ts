import { describe, it, expect } from "vitest";
import {
  insertUserSchema,
  loginSchema,
  insertBookSchema,
  insertBookRequestSchema,
  insertMessageSchema,
  insertOfferSchema,
  updateOfferSchema,
} from "@shared/schema";

// ────────────────────────────────────────────────────────────────
// insertUserSchema
// ────────────────────────────────────────────────────────────────

describe("insertUserSchema", () => {
  const valid = {
    username: "alice_99",
    displayName: "Alice Smith",
    email: "alice@example.com",
    password: "SuperSecret1@2",
  };

  it("accepts a valid user payload", () => {
    expect(() => insertUserSchema.parse(valid)).not.toThrow();
  });

  it("rejects a username shorter than 3 characters", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, username: "al" })
    ).toThrow();
  });

  it("rejects a username longer than 30 characters", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, username: "a".repeat(31) })
    ).toThrow();
  });

  it("rejects a username containing a space", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, username: "alice 99" })
    ).toThrow();
  });

  it("accepts a username with allowed special chars (dot, hyphen, underscore)", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, username: "alice.bob-99" })
    ).not.toThrow();
  });

  it("trims leading/trailing whitespace from username", () => {
    const parsed = insertUserSchema.parse({ ...valid, username: "  alice  " });
    expect(parsed.username).toBe("alice");
  });

  it("rejects an invalid email", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, email: "not-an-email" })
    ).toThrow();
  });

  it("rejects a password shorter than 12 characters", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, password: "Short1@" })
    ).toThrow();
  });

  it("rejects a missing displayName", () => {
    const { displayName, ...rest } = valid;
    expect(() => insertUserSchema.parse(rest)).toThrow();
  });

  it("rejects an empty displayName", () => {
    expect(() =>
      insertUserSchema.parse({ ...valid, displayName: "" })
    ).toThrow();
  });

  it("trims displayName whitespace", () => {
    const parsed = insertUserSchema.parse({
      ...valid,
      displayName: "  Alice  ",
    });
    expect(parsed.displayName).toBe("Alice");
  });
});

// ────────────────────────────────────────────────────────────────
// loginSchema
// ────────────────────────────────────────────────────────────────

describe("loginSchema", () => {
  it("accepts valid email and password", () => {
    expect(() =>
      loginSchema.parse({ email: "alice@example.com", password: "any" })
    ).not.toThrow();
  });

  it("rejects invalid email", () => {
    expect(() =>
      loginSchema.parse({ email: "bad", password: "pass" })
    ).toThrow();
  });

  it("rejects empty password", () => {
    expect(() =>
      loginSchema.parse({ email: "alice@example.com", password: "" })
    ).toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
// insertBookSchema
// ────────────────────────────────────────────────────────────────

describe("insertBookSchema", () => {
  const valid = {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    condition: "good",
    status: "for-sale",
  };

  it("accepts a minimal valid book payload", () => {
    expect(() => insertBookSchema.parse(valid)).not.toThrow();
  });

  it("rejects a missing title", () => {
    const { title, ...rest } = valid;
    expect(() => insertBookSchema.parse(rest)).toThrow();
  });

  it("rejects an empty title", () => {
    expect(() => insertBookSchema.parse({ ...valid, title: "" })).toThrow();
  });

  it("rejects a missing author", () => {
    const { author, ...rest } = valid;
    expect(() => insertBookSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid condition value", () => {
    expect(() =>
      insertBookSchema.parse({ ...valid, condition: "perfect" })
    ).toThrow();
  });

  it("accepts all valid condition values", () => {
    for (const condition of ["new", "like-new", "good", "fair", "poor"]) {
      expect(() =>
        insertBookSchema.parse({ ...valid, condition })
      ).not.toThrow();
    }
  });

  it("rejects an invalid status value", () => {
    expect(() =>
      insertBookSchema.parse({ ...valid, status: "sold" })
    ).toThrow();
  });

  it("accepts all valid status values", () => {
    for (const status of [
      "for-sale",
      "not-for-sale",
      "open-to-offers",
      "wishlist",
      "reading",
    ]) {
      expect(() =>
        insertBookSchema.parse({ ...valid, status })
      ).not.toThrow();
    }
  });

  it("rejects a negative price", () => {
    expect(() =>
      insertBookSchema.parse({ ...valid, price: -1 })
    ).toThrow();
  });

  it("accepts a price of 0", () => {
    expect(() =>
      insertBookSchema.parse({ ...valid, price: 0 })
    ).not.toThrow();
  });

  it("accepts null for optional fields", () => {
    expect(() =>
      insertBookSchema.parse({
        ...valid,
        price: null,
        genre: null,
        isbn: null,
        coverUrl: null,
        description: null,
      })
    ).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
// insertBookRequestSchema
// ────────────────────────────────────────────────────────────────

describe("insertBookRequestSchema", () => {
  const valid = { title: "Dune" };

  it("accepts a minimal valid request (title only)", () => {
    expect(() => insertBookRequestSchema.parse(valid)).not.toThrow();
  });

  it("rejects an empty title", () => {
    expect(() =>
      insertBookRequestSchema.parse({ title: "" })
    ).toThrow();
  });

  it("accepts optional fields as null", () => {
    expect(() =>
      insertBookRequestSchema.parse({
        ...valid,
        author: null,
        isbn: null,
        maxPrice: null,
        language: null,
        countryOfOrigin: null,
      })
    ).not.toThrow();
  });

  it("rejects a negative maxPrice", () => {
    expect(() =>
      insertBookRequestSchema.parse({ ...valid, maxPrice: -5 })
    ).toThrow();
  });

  it("accepts a maxPrice of 0", () => {
    expect(() =>
      insertBookRequestSchema.parse({ ...valid, maxPrice: 0 })
    ).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
// insertMessageSchema
// ────────────────────────────────────────────────────────────────

describe("insertMessageSchema", () => {
  const valid = { receiverId: 2, content: "Hello!" };

  it("accepts a valid message", () => {
    expect(() => insertMessageSchema.parse(valid)).not.toThrow();
  });

  it("rejects an empty content string", () => {
    expect(() =>
      insertMessageSchema.parse({ ...valid, content: "" })
    ).toThrow();
  });

  it("rejects a missing receiverId", () => {
    expect(() =>
      insertMessageSchema.parse({ content: "Hi" })
    ).toThrow();
  });

  it("accepts an optional bookId", () => {
    expect(() =>
      insertMessageSchema.parse({ ...valid, bookId: 10 })
    ).not.toThrow();
  });

  it("accepts null bookId", () => {
    expect(() =>
      insertMessageSchema.parse({ ...valid, bookId: null })
    ).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
// insertOfferSchema
// ────────────────────────────────────────────────────────────────

describe("insertOfferSchema", () => {
  const valid = { bookId: 1, amount: 10.0 };

  it("accepts a valid offer", () => {
    expect(() => insertOfferSchema.parse(valid)).not.toThrow();
  });

  it("rejects amount below 0.01", () => {
    expect(() =>
      insertOfferSchema.parse({ ...valid, amount: 0.001 })
    ).toThrow();
  });

  it("accepts amount of exactly 0.01", () => {
    expect(() =>
      insertOfferSchema.parse({ ...valid, amount: 0.01 })
    ).not.toThrow();
  });

  it("rejects a missing bookId", () => {
    expect(() => insertOfferSchema.parse({ amount: 5 })).toThrow();
  });

  it("accepts an optional message", () => {
    expect(() =>
      insertOfferSchema.parse({ ...valid, message: "Is this available?" })
    ).not.toThrow();
  });

  it("accepts null message", () => {
    expect(() =>
      insertOfferSchema.parse({ ...valid, message: null })
    ).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────
// updateOfferSchema
// ────────────────────────────────────────────────────────────────

describe("updateOfferSchema", () => {
  it("accepts a valid accepted status", () => {
    expect(() =>
      updateOfferSchema.parse({ status: "accepted" })
    ).not.toThrow();
  });

  it("accepts a valid declined status", () => {
    expect(() =>
      updateOfferSchema.parse({ status: "declined" })
    ).not.toThrow();
  });

  it("accepts a countered status with a counterAmount", () => {
    expect(() =>
      updateOfferSchema.parse({ status: "countered", counterAmount: 15 })
    ).not.toThrow();
  });

  it("rejects an invalid status", () => {
    expect(() =>
      updateOfferSchema.parse({ status: "rejected" })
    ).toThrow();
  });

  it("rejects a counterAmount below 0.01", () => {
    expect(() =>
      updateOfferSchema.parse({ status: "countered", counterAmount: 0 })
    ).toThrow();
  });

  it("accepts a null counterAmount", () => {
    expect(() =>
      updateOfferSchema.parse({ status: "accepted", counterAmount: null })
    ).not.toThrow();
  });
});
