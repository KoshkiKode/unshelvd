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

  it("returns medium confidence when the input title contains the match title (reverse direction)", async () => {
    // Make fetch fail so strategies 1 and 2 fall through to strategy 3
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    // The input title "Dune: The Complete Epic" normalises to a string that
    // contains the match title "Dune". The match author "Herbert" is contained
    // by the input author "Frank Herbert". Both containment checks use the
    // right-side (reverse) branch of the || in the medium-confidence condition.
    dbResults.push([
      { id: 20, title: "Dune", author: "Herbert" },
    ]);

    const result = await resolveWork({
      title: "Dune: The Complete Epic",
      author: "Frank Herbert",
    });
    expect(result.isNew).toBe(false);
    expect(result.workId).toBe(20);
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

  it("sets translationCount to 0 when the translation query returns count 0", async () => {
    dbResults.push(
      [{ count: 3, languages: 2 }],                   // editionStats
      [{ count: 5 }],                                  // listingStats
      [{ id: 4, originalLanguage: "English" }],        // work lookup — has originalLanguage
      [{ count: 0 }],                                  // transStats — zero translations
      [],                                              // update result
    );

    await updateWorkStats(4);

    expect((db as any).set).toHaveBeenCalledWith(
      expect.objectContaining({
        translationCount: 0,
      }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — resolveViaOpenLibrary: non-ok fetch responses
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — resolveViaOpenLibrary: non-ok HTTP responses fall through", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls through when the ISBN edition fetch returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // ISBN endpoint returns non-ok → resolveViaOpenLibrary returns null
        .mockResolvedValueOnce({ ok: false })
        // Strategy 2: OL title+author search → no docs
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ docs: [] }),
        }),
    );

    // Strategy 3 fuzzy: no match
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 500, title: "Test Book", author: "Test Author" }]);

    const result = await resolveWork({
      title: "Test Book",
      author: "Test Author",
      isbn: "8888888888",
    });

    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(500);
  });

  it("falls through when the work-detail fetch returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        // ISBN endpoint returns ok with a work key
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Test Book", works: [{ key: "/works/OL600W" }] }),
        })
        // Work-detail fetch returns non-ok → resolveViaOpenLibrary returns null
        .mockResolvedValueOnce({ ok: false })
        // Strategy 2: OL title+author search → no docs
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ docs: [] }),
        }),
    );

    // Strategy 3 fuzzy: no match
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 501, title: "Test Book", author: "Test Author" }]);

    const result = await resolveWork({
      title: "Test Book",
      author: "Test Author",
      isbn: "9999999999",
    });

    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(501);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 1: input.year fallback (branch coverage for line 74)
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 1: uses input.year when OL work lacks firstPublishYear", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to input.year when the OL work has no first_publish_date", async () => {
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
            // deliberately omit first_publish_date so firstPublishYear → null
            edition_count: 5,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "Frank Herbert" }),
        }),
    );

    // No existing work by OL work ID, then insert returns new work
    dbResults.push(
      [],
      [{ id: 77, title: "Dune", author: "Frank Herbert" }],
    );

    const result = await resolveWork({
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780441013593",
      year: 1965, // should be used as the fallback when OL provides no year
    });

    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("exact");
    expect(result.workId).toBe(77);
    // The insert should have been called with the fallback year value
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ firstPublishedYear: 1965 }),
    );
  });

  it("uses null for firstPublishedYear when neither OL nor input provides a year", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Obscure Book", works: [{ key: "/works/OL999W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Obscure Book",
            // No first_publish_date and no authors
            edition_count: 1,
          }),
        }),
    );

    dbResults.push(
      [],
      [{ id: 78, title: "Obscure Book", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Obscure Book",
      author: "Unknown",
      isbn: "0000000001",
      // no year provided
    });

    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("exact");
    // The insert should have been called with null for firstPublishedYear
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ firstPublishedYear: null }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 2: searchOpenLibraryWork rejects non-/works/ keys
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 2: falls through when doc.key is not a /works/ path", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls through to strategy 4 when doc.key is not a /works/ path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              // A book-level key rather than a work-level key
              key: "/books/OL123M",
              title: "Dune",
              author_name: ["Frank Herbert"],
              first_publish_year: 1965,
              edition_count: 5,
            },
          ],
        }),
      }),
    );

    // Strategy 3 fuzzy: no match in db
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 200, title: "Dune", author: "Frank Herbert" }]);

    const result = await resolveWork({ title: "Dune", author: "Frank Herbert" });
    // searchOpenLibraryWork returns null → falls through to strategy 4
    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(200);
  });

  it("uses fallback author, null year and edition count of 1 when doc fields are missing", async () => {
    // A doc with a valid /works/ key and matching title, but no author_name,
    // first_publish_year, or edition_count → exercises the falsy || fallback
    // branches in searchOpenLibraryWork's return statement.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL789W",
              title: "Foundation",
              // author_name omitted → fallback to input author
              // first_publish_year omitted → null
              // edition_count omitted → 1
            },
          ],
        }),
      }),
    );

    // db: no existing work for that OL ID, then insert new work
    dbResults.push(
      [],
      [{ id: 201, title: "Foundation", author: "Isaac Asimov" }],
    );

    const result = await resolveWork({ title: "Foundation", author: "Isaac Asimov" });
    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("high");
    expect(result.workId).toBe(201);
    // Confirm fallback values were propagated into the insert
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({
        author: "Isaac Asimov",   // from input, not doc.author_name
        firstPublishedYear: null, // doc.first_publish_year was absent
        editionCount: 1,          // doc.edition_count was absent
      }),
    );
  });

  it("falls through to strategy 4 when the search fetch returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: false }),
    );

    // Strategy 3 fuzzy: no match
    dbResults.push([]);
    // Strategy 4 insert
    dbResults.push([{ id: 202, title: "Some Book", author: "Some Author" }]);

    const result = await resolveWork({ title: "Some Book", author: "Some Author" });
    expect(result.confidence).toBe("created");
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(202);
  });

  it("normalises a doc with a null title using the empty-string fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          docs: [
            {
              key: "/works/OL321W",
              // title is absent — normalizeTitle uses || "" fallback
              author_name: ["Ghost Author"],
              first_publish_year: 2000,
              edition_count: 2,
            },
          ],
        }),
      }),
    );

    // db: no existing work, then insert
    dbResults.push(
      [],
      [{ id: 203, title: "Mystery Title", author: "Some Author" }],
    );

    const result = await resolveWork({ title: "Mystery Title", author: "Some Author" });
    // searchOpenLibraryWork returns the result (empty normResult includes "" prefix)
    // but normTitle "" includes normResult.substring(0,10) check passes → result returned
    expect(result.isNew).toBe(true);
    expect(result.workId).toBe(203);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — resolveViaOpenLibrary: remaining branch coverage
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — resolveViaOpenLibrary: edition_count and description branches", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults edition count to 1 when the OL work has no edition_count field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Niche Book", works: [{ key: "/works/OL555W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Niche Book",
            // No edition_count → should default to 1
          }),
        }),
    );

    dbResults.push(
      [],
      [{ id: 300, title: "Niche Book", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Niche Book",
      author: "Unknown",
      isbn: "1111111111",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ editionCount: 1 }),
    );
  });

  it("uses the description.value string when the OL work description is an object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Rich Book", works: [{ key: "/works/OL777W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Rich Book",
            // description as an object with a value field (Open Library format)
            description: { value: "A richly detailed story." },
            edition_count: 3,
          }),
        }),
    );

    dbResults.push(
      [],
      [{ id: 301, title: "Rich Book", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Rich Book",
      author: "Unknown",
      isbn: "2222222222",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ description: "A richly detailed story." }),
    );
  });

  it("uses a plain string description when the OL work description is a string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Plain Book", works: [{ key: "/works/OL888W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Plain Book",
            description: "A plain string description.",
            edition_count: 2,
          }),
        }),
    );

    dbResults.push(
      [],
      [{ id: 302, title: "Plain Book", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Plain Book",
      author: "Unknown",
      isbn: "3333333333",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ description: "A plain string description." }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — resolveViaOpenLibrary: author fetch edge cases
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — resolveViaOpenLibrary: author name and title fallback branches", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to 'Unknown' when the author fetch returns no name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Anon Book", works: [{ key: "/works/OL400W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Anon Book",
            authors: [{ author: { key: "/authors/OL9A" } }],
            edition_count: 1,
          }),
        })
        // Author fetch returns a response with no name field
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}), // no name → authorName stays "Unknown"
        }),
    );

    dbResults.push(
      [],
      [{ id: 400, title: "Anon Book", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Anon Book",
      author: "SomeAuthor",
      isbn: "4444444444",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ author: "Unknown" }),
    );
  });

  it("silently uses 'Unknown' when the author detail fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Anon Book 2", works: [{ key: "/works/OL401W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Anon Book 2",
            authors: [{ author: { key: "/authors/OL10A" } }],
            edition_count: 1,
          }),
        })
        // Author fetch throws — inner catch swallows it, authorName stays "Unknown"
        .mockRejectedValueOnce(new Error("Author fetch failed")),
    );

    dbResults.push(
      [],
      [{ id: 401, title: "Anon Book 2", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Anon Book 2",
      author: "SomeAuthor",
      isbn: "5555555555",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ author: "Unknown" }),
    );
  });

  it("falls back to edition.title when the OL work has no title of its own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          // edition has title but work won't
          json: async () => ({
            title: "Edition Title Only",
            works: [{ key: "/works/OL402W" }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            // work.title is absent — resolveViaOpenLibrary falls back to edition.title
            edition_count: 2,
          }),
        }),
    );

    dbResults.push(
      [],
      [{ id: 402, title: "Edition Title Only", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Edition Title Only",
      author: "Unknown",
      isbn: "6666666666",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Edition Title Only" }),
    );
  });

  it("sets firstPublishedYear to null when first_publish_date is a non-numeric string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Old Book", works: [{ key: "/works/OL403W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Old Book",
            // Non-numeric → parseInt returns NaN → || null gives null
            first_publish_date: "circa 1800",
            edition_count: 1,
          }),
        }),
    );

    dbResults.push(
      [],
      [{ id: 403, title: "Old Book", author: "Unknown" }],
    );

    const result = await resolveWork({
      title: "Old Book",
      author: "Unknown",
      isbn: "7777777777",
    });

    expect(result.isNew).toBe(true);
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ firstPublishedYear: null }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — uncovered guard/branch paths
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — guard and branch path coverage", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips OL search and fuzzy matching when title and author are empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Strategy 4 direct insert
    dbResults.push([{ id: 700, title: "", author: "" }]);

    const result = await resolveWork({ title: "", author: "" });

    expect(result).toEqual({ workId: 700, isNew: true, confidence: "created" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps author as 'Unknown' when the OL author endpoint returns non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ title: "Branch Book", works: [{ key: "/works/OL990W" }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            title: "Branch Book",
            authors: [{ author: { key: "/authors/OL990A" } }],
            edition_count: 1,
          }),
        })
        // author endpoint response is non-ok
        .mockResolvedValueOnce({ ok: false }),
    );

    dbResults.push([], [{ id: 701, title: "Branch Book", author: "Unknown" }]);

    const result = await resolveWork({
      title: "Branch Book",
      author: "Input Author",
      isbn: "9990001112",
    });

    expect(result).toEqual({ workId: 701, isNew: true, confidence: "exact" });
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ author: "Unknown" }),
    );
  });

  it("falls through to Strategy 4 when title overlaps but author overlap fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    // Strategy 3 candidate has title overlap but different author
    dbResults.push([{ id: 702, title: "Dune Messiah: Collector Edition", author: "Completely Different" }]);
    dbResults.push([{ id: 703, title: "Dune Messiah", author: "Frank Herbert" }]);

    const result = await resolveWork({
      title: "Dune Messiah",
      author: "Frank Herbert",
    });

    expect(result).toEqual({ workId: 703, isNew: true, confidence: "created" });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — editionCount propagation (no defensive || 1 in resolveWork)
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — editionCount propagated directly from OL helpers", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("Strategy 1 — preserves the exact editionCount returned by resolveViaOpenLibrary", async () => {
    // OL work endpoint returns a specific edition_count; resolveWork should
    // store it verbatim (no extra || 1 truncation).
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
            edition_count: 42,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ name: "Frank Herbert" }),
        }),
    );

    // No existing work → insert new one
    dbResults.push(
      [],
      [{ id: 10, title: "Dune", author: "Frank Herbert" }],
    );

    const result = await resolveWork({
      title: "Dune",
      author: "Frank Herbert",
      isbn: "9780441013593",
    });

    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("exact");
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ editionCount: 42 }),
    );
  });

  it("Strategy 2 — preserves the exact editionCount returned by searchOpenLibraryWork", async () => {
    // OL search returns a specific edition_count; resolveWork should store it verbatim.
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
              edition_count: 30,
            },
          ],
        }),
      }),
    );

    // No existing work → insert new one
    dbResults.push(
      [],
      [{ id: 20, title: "Foundation", author: "Isaac Asimov" }],
    );

    const result = await resolveWork({ title: "Foundation", author: "Isaac Asimov" });

    expect(result.isNew).toBe(true);
    expect(result.confidence).toBe("high");
    expect((db as any).values).toHaveBeenCalledWith(
      expect.objectContaining({ editionCount: 30 }),
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────
// resolveWork — Strategy 3: author last-word extraction (single-word author)
// ──────────────────────────────────────────────────────────────────────────

describe("resolveWork — Strategy 3: fuzzy author last-word extraction", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a single-word author name directly when it has no spaces after normalisation", async () => {
    // Author "Tolstoy" normalises to "tolstoy" — split(" ").pop() returns "tolstoy" directly.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    dbResults.push([{ id: 50, title: "War and Peace", author: "Tolstoy" }]);

    const result = await resolveWork({ title: "War and Peace", author: "Tolstoy" });

    // Exact normalised match → high confidence
    expect(result.isNew).toBe(false);
    expect(result.workId).toBe(50);
    expect(result.confidence).toBe("high");
  });

  it("uses the last word of a multi-word author name for the ilike query", async () => {
    // Author "Leo Tolstoy" — last word is "tolstoy"; the match should still be found.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    dbResults.push([{ id: 51, title: "War and Peace", author: "Leo Tolstoy" }]);

    const result = await resolveWork({ title: "War and Peace", author: "Leo Tolstoy" });

    expect(result.isNew).toBe(false);
    expect(result.workId).toBe(51);
    expect(result.confidence).toBe("high");
  });
});
