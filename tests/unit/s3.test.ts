/**
 * Unit tests for server/s3.ts URL helpers.
 *
 * We mock @aws-sdk/client-s3 so no network call is ever attempted.
 * The module reads its config at import time, so each test re-imports
 * the module after configuring env vars via vi.resetModules().
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@aws-sdk/client-s3", () => {
  const send = vi.fn(async () => ({}));
  class S3Client {
    send = send;
    constructor(_: unknown) {}
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, DeleteObjectCommand, __send: send };
});

async function loadS3(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of [
    "S3_BUCKET_NAME",
    "AWS_REGION",
    "CDN_BASE_URL",
  ]) {
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) process.env[k] = v;
  }
  return await import("../../server/s3");
}

describe("s3.uploadImage URL formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns S3 virtual-hosted URL when no CDN is configured", async () => {
    const s3 = await loadS3({
      S3_BUCKET_NAME: "unshelvd-uploads",
      AWS_REGION: "us-east-1",
    });
    const url = await s3.uploadImage(
      42,
      Buffer.from([1, 2, 3]),
      "image/png",
      "avatar",
    );
    expect(url).toMatch(
      /^https:\/\/unshelvd-uploads\.s3\.us-east-1\.amazonaws\.com\/avatars\/42\/[0-9a-f-]+\.png$/,
    );
  });

  it("returns CDN URL when CDN_BASE_URL is configured", async () => {
    const s3 = await loadS3({
      S3_BUCKET_NAME: "unshelvd-uploads",
      AWS_REGION: "us-east-1",
      CDN_BASE_URL: "https://cdn.koshkikode.com",
    });
    const url = await s3.uploadImage(
      7,
      Buffer.from([0]),
      "image/jpeg",
      "cover",
    );
    expect(url).toMatch(
      /^https:\/\/cdn\.koshkikode\.com\/covers\/7\/[0-9a-f-]+\.jpg$/,
    );
  });

  it("strips a trailing slash from CDN_BASE_URL", async () => {
    const s3 = await loadS3({
      S3_BUCKET_NAME: "unshelvd-uploads",
      AWS_REGION: "us-east-1",
      CDN_BASE_URL: "https://cdn.koshkikode.com///",
    });
    const url = await s3.uploadImage(
      1,
      Buffer.from([0]),
      "image/webp",
      "avatar",
    );
    expect(url).toMatch(
      /^https:\/\/cdn\.koshkikode\.com\/avatars\/1\/[0-9a-f-]+\.webp$/,
    );
    expect(url).not.toContain("//avatars");
  });
});

describe("s3.deleteImage URL parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses a legacy S3 URL even when CDN is now configured", async () => {
    const sdk = (await import("@aws-sdk/client-s3")) as unknown as {
      __send: ReturnType<typeof vi.fn>;
    };
    const s3 = await loadS3({
      S3_BUCKET_NAME: "unshelvd-uploads",
      AWS_REGION: "us-east-1",
      CDN_BASE_URL: "https://cdn.koshkikode.com",
    });
    sdk.__send.mockClear();

    await s3.deleteImage(
      "https://unshelvd-uploads.s3.us-east-1.amazonaws.com/avatars/42/abc.png",
    );

    expect(sdk.__send).toHaveBeenCalledTimes(1);
    const cmd = sdk.__send.mock.calls[0]![0] as { input: { Key: string } };
    expect(cmd.input.Key).toBe("avatars/42/abc.png");
  });

  it("parses a CDN URL when CDN is configured", async () => {
    const sdk = (await import("@aws-sdk/client-s3")) as unknown as {
      __send: ReturnType<typeof vi.fn>;
    };
    const s3 = await loadS3({
      S3_BUCKET_NAME: "unshelvd-uploads",
      AWS_REGION: "us-east-1",
      CDN_BASE_URL: "https://cdn.koshkikode.com",
    });
    sdk.__send.mockClear();

    await s3.deleteImage("https://cdn.koshkikode.com/covers/7/xyz.jpg");

    expect(sdk.__send).toHaveBeenCalledTimes(1);
    const cmd = sdk.__send.mock.calls[0]![0] as { input: { Key: string } };
    expect(cmd.input.Key).toBe("covers/7/xyz.jpg");
  });

  it("ignores URLs that don't belong to either configured prefix", async () => {
    const sdk = (await import("@aws-sdk/client-s3")) as unknown as {
      __send: ReturnType<typeof vi.fn>;
    };
    const s3 = await loadS3({
      S3_BUCKET_NAME: "unshelvd-uploads",
      AWS_REGION: "us-east-1",
      CDN_BASE_URL: "https://cdn.koshkikode.com",
    });
    sdk.__send.mockClear();

    await s3.deleteImage("https://example.com/some-other-image.jpg");
    await s3.deleteImage("");

    expect(sdk.__send).not.toHaveBeenCalled();
  });
});
