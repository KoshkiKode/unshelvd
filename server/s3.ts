/**
 * S3-compatible object storage helpers for profile image uploads.
 *
 * KoshkiKode no longer uses AWS (account closed Oct 2026). Production object
 * storage is Google Cloud Storage, which speaks the S3 protocol via its XML
 * API interoperability layer:
 *
 *   1. Enable "Interoperability" on the GCS bucket settings and create an
 *      HMAC key for the service account.
 *   2. Set S3_ENDPOINT=https://storage.googleapis.com, S3_REGION=auto, and
 *      export the HMAC key as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 *      (standard env names used by every S3-compatible SDK — no AWS involved).
 *
 * Any other S3-compatible store (MinIO, Backblaze B2, Cloudflare R2) works
 * the same way by pointing S3_ENDPOINT at it.
 *
 * Bucket visibility: uploaded objects are written without an ACL (the bucket
 * default applies). Two recommended setups:
 *   1. Make the bucket private and set CDN_BASE_URL to a CDN/custom domain
 *      fronting it, so publicUrl() returns CDN URLs. (Recommended.)
 *   2. Make the bucket objects publicly readable (GCS: "allUsers → Storage
 *      Object Viewer"). Leave CDN_BASE_URL unset; URLs will be
 *      https://storage.googleapis.com/<bucket>/<key>.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";

const BUCKET_NAME = process.env.S3_BUCKET_NAME ?? "";
// Custom S3-protocol endpoint, e.g. "https://storage.googleapis.com" for
// Google Cloud Storage or "http://localhost:9000" for MinIO. When unset the
// SDK talks to AWS-style endpoints (kept only so legacy rows still parse).
const ENDPOINT = (process.env.S3_ENDPOINT ?? "").replace(/\/+$/, "");
const IS_GCS = ENDPOINT.includes("googleapis.com");
// GCS's S3-interop endpoint accepts the literal region "auto". AWS_REGION is
// still read as a fallback because it is the de-facto S3 env var name.
const REGION =
  process.env.S3_REGION ??
  process.env.AWS_REGION ??
  (IS_GCS ? "auto" : "us-east-1");
// Optional CDN base URL fronting the bucket (e.g. Google Cloud CDN in
// front of the GCS bucket), such as "https://cdn.koshkikode.com". When set, newly-uploaded object URLs are
// returned through the CDN. Trailing slashes are stripped so callers don't
// have to be careful. Leaving this unset keeps the legacy S3 URL behaviour.
const CDN_BASE_URL = (process.env.CDN_BASE_URL ?? "").replace(/\/+$/, "");

let _s3: S3Client | null = null;

function getClient(): S3Client {
  if (!_s3) {
    // Credentials come from the default provider chain (AWS_ACCESS_KEY_ID /
    // AWS_SECRET_ACCESS_KEY env vars). On GCS those hold the service-account
    // HMAC key; no AWS services are involved.
    _s3 = new S3Client({
      region: REGION,
      ...(ENDPOINT
        ? { endpoint: ENDPOINT, forcePathStyle: !IS_GCS }
        : {}),
    });
  }
  return _s3;
}

/** Returns true when S3_BUCKET_NAME is configured. */
export function isS3Configured(): boolean {
  return Boolean(BUCKET_NAME);
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Public URL for an object in the configured bucket.
 *
 * Order of preference:
 *   1. `CDN_BASE_URL` — a CDN/custom domain fronting the bucket.
 *   2. Google Cloud Storage path URL (when S3_ENDPOINT points at GCS):
 *      `https://storage.googleapis.com/<bucket>/<key>`.
 *   3. Other custom endpoint: `<endpoint>/<bucket>/<key>` (path style).
 *   4. Legacy AWS virtual-hosted-style URL — only reachable when no endpoint
 *      is configured; kept so pre-migration rows keep resolving.
 */
function publicUrl(key: string): string {
  if (CDN_BASE_URL) {
    return `${CDN_BASE_URL}/${key}`;
  }
  if (IS_GCS) {
    return `https://storage.googleapis.com/${BUCKET_NAME}/${key}`;
  }
  if (ENDPOINT) {
    return `${ENDPOINT}/${BUCKET_NAME}/${key}`;
  }
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
}

/**
 * Upload a raw image buffer to object storage.
 * Returns the public URL produced by publicUrl().
 */
export async function uploadImage(
  userId: number,
  buffer: Buffer,
  mimeType: string,
  type: "avatar" | "cover",
): Promise<string> {
  if (!BUCKET_NAME) {
    throw new Error("S3_BUCKET_NAME is not configured");
  }

  const ext = MIME_TO_EXT[mimeType] ?? "jpg";
  const uuid = crypto.randomUUID();
  const key = `${type}s/${userId}/${uuid}.${ext}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return publicUrl(key);
}

/**
 * Delete an S3 object identified by its public URL.
 * Silently skips URLs that don't belong to this bucket.
 * Errors are logged but never rethrown — deletion is best-effort.
 */
export async function deleteImage(url: string): Promise<void> {
  if (!BUCKET_NAME || !url) return;

  // Accept every URL shape this app has ever written: legacy AWS
  // virtual-hosted URLs, GCS path URLs, other endpoint path-style URLs, and
  // CDN URLs — the database can hold a mix during/after migration.
  // Whichever prefix matches first wins.
  const prefixes = [
    `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/`,
    `https://storage.googleapis.com/${BUCKET_NAME}/`,
  ];
  if (ENDPOINT) prefixes.push(`${ENDPOINT}/${BUCKET_NAME}/`);
  if (CDN_BASE_URL) prefixes.push(`${CDN_BASE_URL}/`);

  let key = "";
  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      key = url.slice(prefix.length);
      break;
    }
  }
  if (!key) return;

  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    );
  } catch (err) {
    console.error("[s3] Failed to delete object:", key, err);
  }
}
