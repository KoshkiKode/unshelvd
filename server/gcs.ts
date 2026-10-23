/**
 * Google Cloud Storage helpers for profile image uploads.
 *
 * Authentication uses the Google Cloud client library's default credential
 * chain. In production, configure GCS_BUCKET_NAME and optionally
 * GCS_PUBLIC_BASE_URL when a custom domain or CDN fronts the bucket.
 */

import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

const BUCKET_NAME = process.env.GCS_BUCKET_NAME ?? "";
const PUBLIC_BASE_URL = (process.env.GCS_PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");

let storage: Storage | null = null;

function getBucket() {
  if (!storage) storage = new Storage();
  return storage.bucket(BUCKET_NAME);
}

/** Returns true when GCS_BUCKET_NAME is configured. */
export function isGcsConfigured(): boolean {
  return Boolean(BUCKET_NAME);
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function publicUrl(key: string): string {
  return `${PUBLIC_BASE_URL || `https://storage.googleapis.com/${BUCKET_NAME}`}/${key}`;
}

export async function uploadImage(
  userId: number,
  buffer: Buffer,
  mimeType: string,
  type: "avatar" | "cover",
): Promise<string> {
  if (!BUCKET_NAME) {
    throw new Error("GCS_BUCKET_NAME is not configured");
  }

  const ext = MIME_TO_EXT[mimeType] ?? "jpg";
  const key = `${type}s/${userId}/${crypto.randomUUID()}.${ext}`;
  await getBucket().file(key).save(buffer, {
    resumable: false,
    metadata: { contentType: mimeType },
  });

  return publicUrl(key);
}

/**
 * Delete a GCS object identified by its public URL.
 * Silently skips URLs that don't belong to this bucket.
 * Errors are logged but never rethrown — deletion is best-effort.
 */
export async function deleteImage(url: string): Promise<void> {
  if (!BUCKET_NAME || !url) return;

  const prefixes = [
    `${PUBLIC_BASE_URL || `https://storage.googleapis.com/${BUCKET_NAME}`}/`,
    `https://storage.googleapis.com/${BUCKET_NAME}/`,
  ];
  const prefix = prefixes.find((candidate) => url.startsWith(candidate));
  if (!prefix) return;

  try {
    await getBucket().file(url.slice(prefix.length)).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error("[gcs] Failed to delete object:", url.slice(prefix.length), err);
  }
}
