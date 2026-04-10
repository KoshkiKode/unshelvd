import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { getWorkEditions, resolveWork, updateWorkStats } from "../../server/work-resolver";
import { db } from "../../server/storage";

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

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 3 medium-confidence branch
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 3: medium confidence when titles overlap", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns medium confidence when the match title contains the input title", async () => {
    // Make fetch fail so strategies 1 and 2 fall through to strategy 3
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    // Strategy 3: db returns a work whose normalized title contains the input
    // normalizeTitle("Dune Messiah: A Novel") → "dune messiah a novel"
    // normalizeTitle("Dune Messiah")           → "dune messiah"
    // "dune messiah a novel".includes("dune messiah") is true → medium confidence
    dbResults.push([
      { id: 15, title: "Dune Messiah: A Novel", author: "Frank Herbert" },
    ]);

    const result = await resolveWork({ title: "Dune Messiah", author: "Frank Herbert" });
    expect(result.isNew).toBe(false);
    expect(result.workId).toBe(15);
    expect(result.confidence).toBe("medium");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 2: Open Library title+author search
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 2: Open Library title+author search", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns high confidence for an existing work found via OL search", async () => {
    // OL search returns a matching doc
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL456W",
              title: "Foundation",
              author_name: ["Isaac Asimov"],
              first_publish_year: 1951,
              cover_i: 98765,
              edition_count: 30,
            },
          ],
        }),
      }),
    );

    // db finds an existing work with that OL ID
    dbResults.push([{ id: 77, title: "Foundation", openLibraryWorkId: "/works/OL456W" }]);

    const result = await resolveWork({ title: "Foundation", author: "Isaac Asimov" });
    expect(result.isNew).toBe(false);
    expect(result.confidence).toBe("high");
    expect(result.workId).toBe(77);
  });

  it("creates a new work with high confidence when OL search finds no existing match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL789W",
              title: "Foundation",
              author_name: ["Isaac Asimov"],
              first_publish_year: 1951,
              cover_i: null,
              edition_count: 5,
            },
          ],
        }),
      }),
    );

    // db: no existing work with that OL ID, then insert returns new work
    dbResults.push(
      [],
      [{ id: 88, title: "Foundation", author: "Isaac Asimov" }],
    );

    const result = await resolveWork({ title: "Foundation", author: "Isaac Asimov" });
    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.workId).toBe(88);
  });

  it("falls through to strategy 4 when OL search returns no docs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ docs: [] }),
      }),
    );

    // Strategy 3 fuzzy search: no match in db
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 90, title: "Obscure Title", author: "Unknown Author" }]);

    const result = await resolveWork({ title: "Obscure Title", author: "Unknown Author" });
    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(90);
  });

  it("falls through when OL search doc title is too different from the input title", async () => {
    // The title-similarity guard (lines 275-277) returns null when the normalized
    // titles share no common 10-char prefix in either direction.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL999W",
              // normalizeTitle → "completely different book title" — shares nothing with "dune"
              title: "A Completely Different Book Title",
              author_name: ["Someone Else"],
              edition_count: 1,
            },
          ],
        }),
      }),
    );

    // Strategy 3 fuzzy: no match
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 102, title: "Dune", author: "Frank Herbert" }]);

    const result = await resolveWork({ title: "Dune", author: "Frank Herbert" });
    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(102);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 1: ISBN via Open Library
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 1: ISBN via Open Library", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns exact confidence for an existing work found via ISBN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // ISBN endpoint → edition with a work key
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Dune", works: [{ key: "/works/OL123W" }] }),
        })
        // Work endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Dune",
            authors: [{ author: { key: "/authors/OL1A" } }],
            covers: [12345],
            first_publish_date: "1965",
            edition_count: 20,
            description: "A sci-fi classic",
          }),
        })
        // Author endpoint
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "Frank Herbert" }),
        }),
    );

    // db: existing work found by OL work ID
    dbResults.push([{ id: 33, title: "Dune", openLibraryWorkId: "/works/OL123W" }]);

    const result = await resolveWork({
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780441013593",
    });
    expect(result.isNew).toBe(false);
    expect(result.confidence).toBe("exact");
    expect(result.workId).toBe(33);
  });

  it("creates a new work with exact confidence when ISBN lookup finds no existing match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Dune", works: [{ key: "/works/OL123W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Dune",
            authors: [{ author: { key: "/authors/OL1A" } }],
            covers: [],
            first_publish_date: "1965",
            edition_count: 20,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "Frank Herbert" }),
        }),
    );

    // db: no existing work, then insert
    dbResults.push(
      [],
      [{ id: 55, title: "Dune", author: "Frank Herbert" }],
    );

    const result = await resolveWork({
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780441013593",
    });
    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("exact");
    expect(result.workId).toBe(55);
  });

  it("falls through to strategy 2 when ISBN lookup returns no work key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // ISBN endpoint returns no "works" field → resolveViaOpenLibrary returns null
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "My Book" }), // no works key
        })
        // Strategy 2: OL search returns no docs
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ docs: [] }),
        }),
    );

    // Strategy 3 fuzzy: no match
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 99, title: "My Book", author: "My Author" }]);

    const result = await resolveWork({
      title: "My Book",
      author: "My Author",
      isbn: "0000000000",
    });
    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(99);
  });

  it("falls through (catch block) when the work-detail fetch throws inside resolveViaOpenLibrary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // ISBN endpoint → ok, returns a work key
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Dune", works: [{ key: "/works/OL123W" }] }),
        })
        // Work detail fetch → throws, triggering the catch block (lines 257-258)
        .mockRejectedValueOnce(new Error("Connection reset"))
        // Strategy 2: OL search → no docs
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ docs: [] }),
        }),
    );

    // Strategy 3 fuzzy: no match
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 101, title: "Dune", author: "Frank Herbert" }]);

    const result = await resolveWork({
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780441013593",
    });
    // resolveViaOpenLibrary returns null → strategies 2-4 continue
    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(101);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// updateWorkStats
// ──────────────────────────────────────────────────────────────────────────

describe("updateWorkStats", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  it("updates work stats and calculates translation count when originalLanguage is set", async () => {
    dbResults.push(
      [{ count: 5, languages: 3 }],                   // editionStats
      [{ count: 8 }],                                  // listingStats
      [{ id: 1, originalLanguage: "Russian" }],        // work lookup
      [{ count: 2 }],                                  // transStats (diff languages)
      [],                                              // update().set().where() result
    );

    await updateWorkStats(1);

    expect((db as any).update).toHaveBeenCalled();
    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        editionCount: 5,
        languageCount: 3,
        translationCount: 2,
        listingCount: 8,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("skips the translation query and sets translationCount to 0 when work has no originalLanguage", async () => {
    dbResults.push(
      [{ count: 2, languages: 1 }],         // editionStats
      [{ count: 3 }],                        // listingStats
      [{ id: 2, originalLanguage: null }],   // work lookup — no originalLanguage
      [],                                    // update result
    );

    await updateWorkStats(2);

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        editionCount: 2,
        languageCount: 1,
        translationCount: 0,
        listingCount: 3,
      }),
    );
  });

  it("handles zero editions and listings gracefully", async () => {
    dbResults.push(
      [],                                    // editionStats — empty (no editions)
      [],                                    // listingStats — empty (no listings)
      [{ id: 3, originalLanguage: null }],   // work lookup
      [],                                    // update result
    );

    await updateWorkStats(3);

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        editionCount: 0,
        languageCount: 0,
        translationCount: 0,
        listingCount: 0,
      }),
    );
  });

  it("handles missing work gracefully (work not found in db)", async () => {
    dbResults.push(
      [{ count: 0, languages: 0 }],  // editionStats
      [{ count: 0 }],                // listingStats
      [],                            // work lookup — not found
      [],                            // update result
    );

    // Should not throw even if the work row doesn't exist
    await expect(updateWorkStats(999)).resolves.toBeUndefined();
    expect((db as any).update).toHaveBeenCalled();
  });
});
