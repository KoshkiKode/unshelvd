import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted queue for db call results ─────────────────────────────────────
const dbResults = vi.hoisted(() => [] as any[]);

// ─── mock the storage module before importing work-resolver ────────────────
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
    groupBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return { db: dbMock, storage: {}, DatabaseStorage: vi.fn() };
});

import { getWorkEditions, resolveWork } from "../../server/work-resolver";

// ──────────────────────────────────────────────────────────────────────────
// getWorkEditions
// ──────────────────────────────────────────────────────────────────────────

describe("getWorkEditions", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("returns zero totals and empty objects for an empty database", async () => {
    dbResults.push([], []); // no catalog editions, no user listings
    const result = await getWorkEditions(1);
    expect(result.totalEditions).toBe(0);
    expect(result.totalListings).toBe(0);
    expect(result.languages).toEqual([]);
    expect(result.catalogEditions).toEqual({});
    expect(result.userListings).toEqual({});
  });

  it("groups catalog editions by language", async () => {
    const editions = [
      { id: 1, title: "War and Peace", language: "English", workId: 1 },
      { id: 2, title: "Война и мир", language: "Russian", workId: 1 },
      { id: 3, title: "War and Peace 2nd ed", language: "English", workId: 1 },
    ];
    dbResults.push(editions, []); // editions + no user listings
    const result = await getWorkEditions(1);
    expect(result.totalEditions).toBe(3);
    expect(result.totalListings).toBe(0);
    expect(result.catalogEditions["English"]).toHaveLength(2);
    expect(result.catalogEditions["Russian"]).toHaveLength(1);
    expect(result.languages).toContain("English");
    expect(result.languages).toContain("Russian");
  });

  it("groups user listings by language", async () => {
    const listings = [
      { id: 10, title: "Dune", language: "English", workId: 5, userId: 1 },
      { id: 11, title: "Dune (copy 2)", language: "English", workId: 5, userId: 2 },
    ];
    dbResults.push([], listings); // no catalog editions, two user listings
    const result = await getWorkEditions(5);
    expect(result.totalEditions).toBe(0);
    expect(result.totalListings).toBe(2);
    expect(result.userListings["English"]).toHaveLength(2);
    expect(result.languages).toContain("English");
  });

  it("falls back to 'Unknown' for editions/listings with a null language", async () => {
    const editions = [
      { id: 1, title: "Mystery Book", language: null, workId: 2 },
    ];
    const listings = [
      { id: 20, title: "Mystery Book", language: null, workId: 2, userId: 3 },
    ];
    dbResults.push(editions, listings);
    const result = await getWorkEditions(2);
    expect(result.catalogEditions["Unknown"]).toHaveLength(1);
    expect(result.userListings["Unknown"]).toHaveLength(1);
    expect(result.languages).toContain("Unknown");
  });

  it("deduplicates languages that appear in both catalog and listings", async () => {
    const editions = [{ id: 1, language: "French", workId: 3 }];
    const listings = [{ id: 20, language: "French", workId: 3 }];
    dbResults.push(editions, listings);
    const result = await getWorkEditions(3);
    // "French" should appear exactly once in the languages array
    const frenchCount = result.languages.filter((l: string) => l === "French").length;
    expect(frenchCount).toBe(1);
  });

  it("combines languages from both catalog editions and user listings", async () => {
    const editions = [{ id: 1, language: "German", workId: 4 }];
    const listings = [{ id: 30, language: "Spanish", workId: 4 }];
    dbResults.push(editions, listings);
    const result = await getWorkEditions(4);
    expect(result.languages).toContain("German");
    expect(result.languages).toContain("Spanish");
    expect(result.totalEditions).toBe(1);
    expect(result.totalListings).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 4 (create new work when all lookups fail)
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 4: creates a new work when all lookups fail", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a new work when fetch is unavailable and db has no fuzzy match", async () => {
    // Make fetch fail so strategies 1 and 2 (Open Library) fall through
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    // Strategy 3 fuzzy match: db returns empty array (no match)
    dbResults.push([]); // works fuzzy search
    // Strategy 4 insert: db returns the new work
    dbResults.push([{ id: 42, title: "My Unique Book", author: "Author Name" }]);

    const result = await resolveWork({ title: "My Unique Book", author: "Author Name" });
    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("created");
    expect(result.workId).toBe(42);
  });

  it("returns high confidence when a fuzzy db match is found", async () => {
    // Make fetch fail so strategies 1 and 2 fall through
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    // Strategy 3: db returns a work with matching normalized title+author
    dbResults.push([
      {
        id: 7,
        title: "Dune",
        author: "Frank Herbert",
      },
    ]);

    const result = await resolveWork({ title: "Dune", author: "Frank Herbert" });
    // Exact normalized match → confidence "high", isNew = false
    expect(result.isNew).toBe(false);
    expect(result.workId).toBe(7);
    expect(result.confidence).toBe("high");
  });
});
