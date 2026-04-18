import { beforeEach, describe, expect, it, vi } from "vitest";

const dbResults = vi.hoisted(() => [] as any[]);
const mocks = vi.hoisted(() => ({ db: null as any, tx: null as any }));

vi.mock("../../server/storage", () => {
  const txMock = {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  };

  const dbMock = {
    then(resolve: (v: any) => void, reject: (r?: any) => void) {
      const value = dbResults.length > 0 ? dbResults.shift() : [];
      return Promise.resolve(value).then(resolve, reject);
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(async (cb: (tx: any) => Promise<void>) => cb(txMock)),
  };

  mocks.db = dbMock;
  mocks.tx = txMock;

  return { db: dbMock, storage: {}, DatabaseStorage: vi.fn() };
});

async function importModule() {
  return import("../../server/platform-settings");
}

describe("platform-settings", () => {
  beforeEach(() => {
    dbResults.length = 0;
    vi.clearAllMocks();
    vi.resetModules();
    vi.useRealTimers();
  });

  it("caches getSetting responses until the cache TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const { getSetting } = await importModule();

    dbResults.push([{ key: "stripe_enabled", value: "true" }]);
    await expect(getSetting("stripe_enabled")).resolves.toBe("true");
    await expect(getSetting("stripe_enabled")).resolves.toBe("true");

    expect(mocks.db.select).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));
    dbResults.push([{ key: "stripe_enabled", value: "false" }]);

    await expect(getSetting("stripe_enabled")).resolves.toBe("false");
    expect(mocks.db.select).toHaveBeenCalledTimes(2);
  });

  it("returns null for missing keys in getSetting/getSettings and serializes all keys", async () => {
    const { getSetting, getSettings, getAllSettings } = await importModule();

    dbResults.push([
      { key: "stripe_enabled", value: "true" },
      { key: "paypal_mode", value: "sandbox" },
    ]);

    await expect(getSetting("missing")).resolves.toBeNull();

    await expect(getSettings(["stripe_enabled", "missing"]))
      .resolves.toEqual({ stripe_enabled: "true", missing: null });

    await expect(getAllSettings()).resolves.toEqual({
      stripe_enabled: "true",
      paypal_mode: "sandbox",
    });

    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });

  it("upserts a single setting and invalidates cache", async () => {
    const { getSetting, setSetting } = await importModule();

    dbResults.push([{ key: "maintenance_mode", value: "false" }]);
    await expect(getSetting("maintenance_mode")).resolves.toBe("false");

    await setSetting("maintenance_mode", "true");
    expect(mocks.db.insert).toHaveBeenCalledTimes(1);
    expect(mocks.db.onConflictDoUpdate).toHaveBeenCalledTimes(1);

    dbResults.push([{ key: "maintenance_mode", value: "true" }]);
    await expect(getSetting("maintenance_mode")).resolves.toBe("true");
    expect(mocks.db.select).toHaveBeenCalledTimes(2);
  });

  it("returns early for empty bulk updates and upserts each entry in a transaction", async () => {
    const { getSetting, setSettings } = await importModule();

    await setSettings({});
    expect(mocks.db.transaction).not.toHaveBeenCalled();

    dbResults.push([{ key: "email_enabled", value: "false" }]);
    await expect(getSetting("email_enabled")).resolves.toBe("false");

    await setSettings({ email_enabled: "true", paypal_client_secret: null });

    expect(mocks.db.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.insert).toHaveBeenCalledTimes(2);
    expect(mocks.tx.onConflictDoUpdate).toHaveBeenCalledTimes(2);

    dbResults.push([{ key: "email_enabled", value: "true" }]);
    await expect(getSetting("email_enabled")).resolves.toBe("true");
    expect(mocks.db.select).toHaveBeenCalledTimes(2);
  });

  it("interprets feature flags with defaults via isEnabled", async () => {
    const { isEnabled } = await importModule();

    dbResults.push([{ key: "registrations_enabled", value: "TrUe" }]);
    await expect(isEnabled("registrations_enabled", false)).resolves.toBe(true);

    vi.resetModules();
    const { isEnabled: isEnabled2 } = await importModule();
    dbResults.push([{ key: "registrations_enabled", value: "false" }]);
    await expect(isEnabled2("registrations_enabled", true)).resolves.toBe(false);

    vi.resetModules();
    const { isEnabled: isEnabled3 } = await importModule();
    dbResults.push([]);
    await expect(isEnabled3("registrations_enabled", true)).resolves.toBe(true);
  });

  it("masks and identifies secret settings safely", async () => {
    const { SECRET_KEYS, maskSecret } = await importModule();

    expect(SECRET_KEYS.has("paypal_client_secret")).toBe(true);
    expect(SECRET_KEYS.has("paypal_mode")).toBe(false);

    expect(maskSecret(null)).toBeNull();
    expect(maskSecret("")).toBeNull();
    expect(maskSecret("abcd")).toBe("••••");
    expect(maskSecret("abcde")).toBe("•bcde");
    expect(maskSecret("averylongsecretvalue")).toMatch(/[•]+alue$/);
  });
});
