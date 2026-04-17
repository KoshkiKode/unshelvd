/**
 * Google Cloud Storage helpers for profile image uploads.
 *
 * Auth: On Cloud Run the service account identity is used automatically via
 * Application Default Credentials (ADC) — no credentials file required.
 * Locally, either run `gcloud auth application-default login` or point
 * GOOGLE_APPLICATION_CREDENTIALS at a service-account key file.
 *
 * Bucket visibility: if uniform bucket-level IAM is enabled (the GCP default),
 * grant  allUsers  the  roles/storage.objectViewer  role so uploaded images
 * are publicly readable via the storage.googleapis.com URL.
 */

import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

const BUCKET_NAME = process.env.GCS_BUCKET_NAME ?? "";

let _storage: Storage | null = null;

function getStorage(): Storage {
  if (!_storage) {
    _storage = new Storage(); // Uses ADC — no explicit credentials needed
  }
  return _storage;
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

/**
 * Upload a raw image buffer to GCS.
 * Returns the public https://storage.googleapis.com/… URL.
 */
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
  const uuid = crypto.randomUUID();
  const path = `${type}s/${userId}/${uuid}.${ext}`;

  const file = getStorage().bucket(BUCKET_NAME).file(path);
  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
  });

  return `https://storage.googleapis.com/${BUCKET_NAME}/${path}`;
}

/**
 * Delete a GCS object identified by its public URL.
 * Silently skips URLs that don't belong to this bucket.
 * Errors are logged but never rethrown — deletion is best-effort.
 */
export async function deleteImage(url: string): Promise<void> {
  if (!BUCKET_NAME || !url) return;

  const prefix = `https://storage.googleapis.com/${BUCKET_NAME}/`;
  if (!url.startsWith(prefix)) return;

  const path = url.slice(prefix.length);
  if (!path) return;

  try {
    await getStorage().bucket(BUCKET_NAME).file(path).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error("[gcs] Failed to delete object:", path, err);
  }
}
