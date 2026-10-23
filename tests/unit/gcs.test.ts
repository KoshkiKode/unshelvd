/**
 * Unit tests for server/gcs.ts object-storage URL helpers.
 *
 * The Google Cloud client is mocked so no network call is attempted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const save = vi.fn(async () => undefined);
const deleteObject = vi.fn(async () => undefined);
const file = vi.fn(() => ({ save, delete: deleteObject }));
const bucket = vi.fn(() => ({ file }));
const Storage = vi.fn(class {
  bucket = bucket;
});

vi.mock("@google-cloud/storage", () => ({ Storage }));

async function loadGcs(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ["GCS_BUCKET_NAME", "GCS_PUBLIC_BASE_URL"]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  return await import("../../server/gcs");
}

describe("gcs.uploadImage URL formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the default Google Cloud Storage URL", async () => {
    const gcs = await loadGcs({ GCS_BUCKET_NAME: "unshelvd-uploads" });
    const url = await gcs.uploadImage(42, Buffer.from([1, 2, 3]), "image/png", "avatar");

    expect(url).toMatch(
      /^https:\/\/storage\.googleapis\.com\/unshelvd-uploads\/avatars\/42\/[0-9a-f-]+\.png$/,
    );
    expect(save).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      expect.objectContaining({ metadata: { contentType: "image/png" } }),
    );
  });

  it("returns a custom public base URL and strips trailing slashes", async () => {
    const gcs = await loadGcs({
      GCS_BUCKET_NAME: "unshelvd-uploads",
      GCS_PUBLIC_BASE_URL: "https://cdn.koshkikode.com///",
    });
    const url = await gcs.uploadImage(7, Buffer.from([0]), "image/jpeg", "cover");

    expect(url).toMatch(/^https:\/\/cdn\.koshkikode\.com\/covers\/7\/[0-9a-f-]+\.jpg$/);
    expect(url).not.toContain("//covers");
  });
});

describe("gcs.deleteImage URL parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes an object from the configured public base URL", async () => {
    const gcs = await loadGcs({
      GCS_BUCKET_NAME: "unshelvd-uploads",
      GCS_PUBLIC_BASE_URL: "https://cdn.koshkikode.com",
    });

    await gcs.deleteImage("https://cdn.koshkikode.com/covers/7/xyz.jpg");

    expect(deleteObject).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it("ignores URLs that do not belong to the configured bucket", async () => {
    const gcs = await loadGcs({ GCS_BUCKET_NAME: "unshelvd-uploads" });

    await gcs.deleteImage("https://example.com/some-other-image.jpg");
    await gcs.deleteImage("");

    expect(deleteObject).not.toHaveBeenCalled();
  });
});
