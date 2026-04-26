/**
 * Amazon S3 helpers for profile image uploads.
 *
 * Auth: On AWS ECS Fargate the task role's IAM identity is used automatically
 * via the default AWS credential provider chain — no static credentials
 * required. Locally, either run `aws configure` or export
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in your shell.
 *
 * Bucket visibility: uploaded objects are written without an ACL (the bucket
 * default applies). Make the bucket publicly readable either by:
 *   1. Disabling "Block Public Access" + attaching a bucket policy that
 *      grants s3:GetObject to "Principal: *" for the prefix used here, or
 *   2. Fronting the bucket with CloudFront and serving objects through it.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "crypto";

const BUCKET_NAME = process.env.S3_BUCKET_NAME ?? "";
const REGION = process.env.AWS_REGION ?? "us-east-1";

let _s3: S3Client | null = null;

function getClient(): S3Client {
  if (!_s3) {
    // The SDK picks up credentials from the default provider chain
    // (env vars, shared config, IMDS, ECS task role, etc.).
    _s3 = new S3Client({ region: REGION });
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

/** Public virtual-hosted-style URL for an object in the configured bucket. */
function publicUrl(key: string): string {
  return `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;
}

/**
 * Upload a raw image buffer to S3.
 * Returns the public https://<bucket>.s3.<region>.amazonaws.com/… URL.
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

  const prefix = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/`;
  if (!url.startsWith(prefix)) return;

  const key = url.slice(prefix.length);
  if (!key) return;

  try {
    await getClient().send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    );
  } catch (err) {
    console.error("[s3] Failed to delete object:", key, err);
  }
}
