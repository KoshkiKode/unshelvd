/**
 * Platform Settings — admin-managed runtime configuration.
 *
 * Settings are stored in the `platform_settings` table and cached
 * in-memory for fast reads.  The cache is invalidated whenever
 * settings are written.
 *
 * Supported keys (string values unless noted):
 *   stripe_enabled          — "true" | "false"
 *   stripe_secret_key       — sk_live_... / sk_test_...
 *   stripe_publishable_key  — pk_live_... / pk_test_...
 *   stripe_webhook_secret   — whsec_...
 *   paypal_enabled          — "true" | "false"
 *   paypal_client_id        — PayPal app client ID
 *   paypal_client_secret    — PayPal app client secret
 *   paypal_mode             — "sandbox" | "live"
 *   platform_fee_percent    — numeric string, e.g. "10"
 *   maintenance_mode        — "true" | "false"
 *   registrations_enabled   — "true" | "false"
 */

import { db } from "./storage";
import { platformSettings } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

// ── In-memory cache ────────────────────────────────────────────────────────

let cache: Map<string, string | null> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function loadCache(): Promise<Map<string, string | null>> {
  const rows = await db.select().from(platformSettings);
  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(row.key, row.value ?? null);
  }
  cache = map;
  cacheLoadedAt = Date.now();
  return map;
}

function invalidateCache() {
  cache = null;
  cacheLoadedAt = 0;
}

async function getCache(): Promise<Map<string, string | null>> {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  return loadCache();
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Get a single setting.  Returns null when not set. */
export async function getSetting(key: string): Promise<string | null> {
  const map = await getCache();
  return map.get(key) ?? null;
}

/** Get multiple settings at once.  Missing keys return null. */
export async function getSettings(
  keys: string[],
): Promise<Record<string, string | null>> {
  const map = await getCache();
  const result: Record<string, string | null> = {};
  for (const k of keys) result[k] = map.get(k) ?? null;
  return result;
}

/** Get all settings as a plain record. */
export async function getAllSettings(): Promise<Record<string, string | null>> {
  const map = await getCache();
  const result: Record<string, string | null> = {};
  for (const [k, v] of map) result[k] = v;
  return result;
}

/**
 * Upsert a single setting.
 * Pass null to delete the key (row stays with null value).
 */
export async function setSetting(key: string, value: string | null): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
  invalidateCache();
}

/** Upsert multiple settings at once. */
export async function setSettings(
  entries: Record<string, string | null>,
): Promise<void> {
  const kvPairs = Object.entries(entries);
  if (kvPairs.length === 0) return;

  const now = new Date();
  // Execute all upserts in a single transaction
  await db.transaction(async (tx) => {
    for (const [key, value] of kvPairs) {
      await tx
        .insert(platformSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: { value, updatedAt: now },
        });
    }
  });
  invalidateCache();
}

// ── Convenience boolean helper ─────────────────────────────────────────────

/**
 * Returns true when the setting is "true" (case-insensitive).
 * Falls back to the provided default when the setting is not configured.
 */
export async function isEnabled(
  key: string,
  defaultValue = false,
): Promise<boolean> {
  const val = await getSetting(key);
  if (val === null) return defaultValue;
  return val.toLowerCase() === "true";
}

// ── Keys that contain secrets (masked in admin GET) ────────────────────────

export const SECRET_KEYS = new Set([
  "stripe_secret_key",
  "stripe_webhook_secret",
  "paypal_client_secret",
]);

/**
 * Mask a secret value so it is safe to return from the admin API.
 * Shows only the last 4 characters: ••••••••abcd
 */
export function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.min(value.length - 4, 12))}${value.slice(-4)}`;
}
