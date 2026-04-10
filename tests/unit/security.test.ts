import { describe, it, expect } from "vitest";
import { sanitizeLikeInput, parseIntParam, stripHtml } from "../../server/security";

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
