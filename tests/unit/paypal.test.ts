/**
 * Unit tests for server/paypal.ts
 *
 * platform-settings and global fetch are fully mocked.
 * vi.resetModules() is called before each test to reset the module-level
 * _tokenCache so every test starts with no cached OAuth token.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted state for platform-settings mock ──────────────────────────────
const paypalState = vi.hoisted(() => ({
  enabled: false,
  clientId: null as string | null,
  clientSecret: null as string | null,
  mode: "sandbox",
}));

vi.mock("../../server/platform-settings", () => ({
  isEnabled: vi.fn(async (_key: string, def: boolean) => paypalState.enabled),
  getSetting: vi.fn(async (key: string) => {
    switch (key) {
      case "paypal_client_id":
        return paypalState.clientId;
      case "paypal_client_secret":
        return paypalState.clientSecret;
      case "paypal_mode":
        return paypalState.mode;
      default:
        return null;
    }
  }),
}));

// ── Global fetch mock ─────────────────────────────────────────────────────
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

// ── Helpers ───────────────────────────────────────────────────────────────

/** Queue a token response (always consumed before any subsequent API call). */
function mockToken() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: "MOCK_TOKEN_ABC", expires_in: 3600 }),
    text: async () => "",
  });
}

/** Queue a successful JSON API response. */
function mockApiOk(body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

/** Queue a failed API response. */
function mockApiError(status: number, text = "PayPal API Error") {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error: text }),
    text: async () => text,
  });
}

/** Configure valid PayPal credentials. */
function setCredentials() {
  paypalState.enabled = true;
  paypalState.clientId = "CLIENT_ID_123";
  paypalState.clientSecret = "CLIENT_SECRET_456";
  paypalState.mode = "sandbox";
}

/** Dynamically import a fresh paypal module (token cache is reset). */
async function importPaypal() {
  return import("../../server/paypal");
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  // Reset state to defaults
  paypalState.enabled = false;
  paypalState.clientId = null;
  paypalState.clientSecret = null;
  paypalState.mode = "sandbox";
});

// ──────────────────────────────────────────────────────────────────────────
// isPayPalEnabled
// ──────────────────────────────────────────────────────────────────────────

describe("isPayPalEnabled", () => {
  it("returns false when paypal_enabled is false", async () => {
    paypalState.enabled = false;
    const { isPayPalEnabled } = await importPaypal();
    await expect(isPayPalEnabled()).resolves.toBe(false);
  });

  it("returns false when enabled but credentials are missing", async () => {
    paypalState.enabled = true;
    paypalState.clientId = null;
    paypalState.clientSecret = null;
    const { isPayPalEnabled } = await importPaypal();
    await expect(isPayPalEnabled()).resolves.toBe(false);
  });

  it("returns false when only clientId is present (no secret)", async () => {
    paypalState.enabled = true;
    paypalState.clientId = "CLIENT_ID";
    paypalState.clientSecret = null;
    const { isPayPalEnabled } = await importPaypal();
    await expect(isPayPalEnabled()).resolves.toBe(false);
  });

  it("returns true when enabled and both credentials are present", async () => {
    setCredentials();
    const { isPayPalEnabled } = await importPaypal();
    await expect(isPayPalEnabled()).resolves.toBe(true);
  });

  it("defaults mode to 'sandbox' when paypal_mode setting is empty", async () => {
    // Set up credentials but leave mode as empty string so the || "sandbox" fallback is used
    paypalState.enabled = true;
    paypalState.clientId = "CLIENT_ID";
    paypalState.clientSecret = "CLIENT_SECRET";
    paypalState.mode = "" as any; // empty → falsy → falls back to "sandbox"

    mockToken();
    mockApiOk({
      id: "ORDER1",
      links: [{ rel: "payer-action", href: "https://sandbox.paypal.com/approve" }],
    });
    const { createPayPalOrder } = await importPaypal();
    const params = {
      bookId: 1,
      buyerId: 2,
      sellerId: 3,
      amount: 10.0,
      returnUrl: "https://app.com/return",
      cancelUrl: "https://app.com/cancel",
    };
    const result = await createPayPalOrder(params);
    // Falls back to sandbox, so the sandbox API URL is called
    const sandboxCall = fetchMock.mock.calls.find((c) =>
      /sandbox\.paypal\.com/.test(c[0] as string),
    );
    expect(sandboxCall).toBeDefined();
    expect(result.orderId).toBe("ORDER1");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// validatePayPalId (tested indirectly via exported functions)
// ──────────────────────────────────────────────────────────────────────────

describe("validatePayPalId (via authorizePayPalOrder / capturePayPalAuthorization / refundPayPalCapture)", () => {
  it("throws for an ID with lowercase letters", async () => {
    setCredentials();
    const { authorizePayPalOrder } = await importPaypal();
    await expect(authorizePayPalOrder("lowercaseid")).rejects.toThrow(/invalid order id/i);
  });

  it("throws for an ID containing hyphens", async () => {
    setCredentials();
    const { capturePayPalAuthorization } = await importPaypal();
    await expect(capturePayPalAuthorization("BAD-ID")).rejects.toThrow(
      /invalid authorization id/i,
    );
  });

  it("throws for an ID containing special characters", async () => {
    setCredentials();
    const { refundPayPalCapture } = await importPaypal();
    await expect(refundPayPalCapture("CAPTURE!!!")).rejects.toThrow(/invalid capture id/i);
  });

  it("throws for an ID that is too long (> 22 chars)", async () => {
    setCredentials();
    const { authorizePayPalOrder } = await importPaypal();
    const longId = "A".repeat(23);
    await expect(authorizePayPalOrder(longId)).rejects.toThrow(/invalid order id/i);
  });

  it("accepts a valid uppercase-alphanumeric ID", async () => {
    setCredentials();
    mockToken();
    mockApiOk({
      status: "COMPLETED",
      purchase_units: [
        {
          payments: {
            authorizations: [{ id: "AUTH123", status: "CREATED" }],
          },
        },
      ],
    });
    const { authorizePayPalOrder } = await importPaypal();
    await expect(authorizePayPalOrder("ORDER123456")).resolves.toMatchObject({
      authorizationId: "AUTH123",
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// createPayPalOrder
// ──────────────────────────────────────────────────────────────────────────

describe("createPayPalOrder", () => {
  const params = {
    bookId: 1,
    buyerId: 2,
    sellerId: 3,
    amount: 19.99,
    returnUrl: "https://app.com/return",
    cancelUrl: "https://app.com/cancel",
  };

  it("throws when PayPal is not configured", async () => {
    const { createPayPalOrder } = await importPaypal();
    await expect(createPayPalOrder(params)).rejects.toThrow("PayPal is not configured");
  });

  it("returns orderId and approveUrl on success", async () => {
    setCredentials();
    mockToken();
    mockApiOk({
      id: "ORDER999",
      links: [
        { rel: "self", href: "https://api.paypal.com/..." },
        { rel: "payer-action", href: "https://paypal.com/approve?token=abc" },
      ],
    });
    const { createPayPalOrder } = await importPaypal();
    const result = await createPayPalOrder(params);
    expect(result.orderId).toBe("ORDER999");
    expect(result.approveUrl).toBe("https://paypal.com/approve?token=abc");
  });

  it("throws when PayPal returns no payer-action link", async () => {
    setCredentials();
    mockToken();
    mockApiOk({
      id: "ORDER999",
      links: [{ rel: "self", href: "https://api.paypal.com/..." }],
    });
    const { createPayPalOrder } = await importPaypal();
    await expect(createPayPalOrder(params)).rejects.toThrow(
      /did not return an approval url/i,
    );
  });

  it("throws when the API call fails", async () => {
    setCredentials();
    mockToken();
    mockApiError(422, "Unprocessable Entity");
    const { createPayPalOrder } = await importPaypal();
    await expect(createPayPalOrder(params)).rejects.toThrow(/422/);
  });

  it("uses the sandbox base URL by default", async () => {
    setCredentials();
    mockToken();
    mockApiOk({
      id: "ORDER1",
      links: [{ rel: "payer-action", href: "https://sandbox.paypal.com/approve" }],
    });
    const { createPayPalOrder } = await importPaypal();
    await createPayPalOrder(params);
    // Verify that the order create call hit the sandbox URL
    const orderCall = fetchMock.mock.calls.find((c) =>
      /^https:\/\/api-m\.sandbox\.paypal\.com\//.test(c[0] as string),
    );
    expect(orderCall).toBeDefined();
  });

  it("uses the live base URL when mode is 'live'", async () => {
    setCredentials();
    paypalState.mode = "live";
    mockToken();
    mockApiOk({
      id: "ORDER1",
      links: [{ rel: "payer-action", href: "https://paypal.com/approve" }],
    });
    const { createPayPalOrder } = await importPaypal();
    await createPayPalOrder(params);
    // Verify the order-create call hit the live URL (not sandbox)
    const liveCall = fetchMock.mock.calls.find(
      (c) => /^https:\/\/api-m\.paypal\.com\//.test(c[0] as string),
    );
    expect(liveCall).toBeDefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// authorizePayPalOrder
// ──────────────────────────────────────────────────────────────────────────

describe("authorizePayPalOrder", () => {
  it("throws when PayPal is not configured", async () => {
    const { authorizePayPalOrder } = await importPaypal();
    await expect(authorizePayPalOrder("ORDER123")).rejects.toThrow(
      "PayPal is not configured",
    );
  });

  it("returns authorizationId and status on success", async () => {
    setCredentials();
    mockToken();
    mockApiOk({
      status: "COMPLETED",
      purchase_units: [
        { payments: { authorizations: [{ id: "AUTHID789", status: "CREATED" }] } },
      ],
    });
    const { authorizePayPalOrder } = await importPaypal();
    const result = await authorizePayPalOrder("ORDER123456");
    expect(result.authorizationId).toBe("AUTHID789");
    expect(result.status).toBe("CREATED");
  });

  it("throws when authorization data is missing from the response", async () => {
    setCredentials();
    mockToken();
    // Response with no purchase_units → missing auth data
    mockApiOk({ status: "COMPLETED", purchase_units: [] });
    const { authorizePayPalOrder } = await importPaypal();
    await expect(authorizePayPalOrder("ORDER123456")).rejects.toThrow(
      /missing authorization data/i,
    );
  });

  it("throws when the API returns an error status", async () => {
    setCredentials();
    mockToken();
    mockApiError(400, "Bad Request");
    const { authorizePayPalOrder } = await importPaypal();
    await expect(authorizePayPalOrder("ORDER123456")).rejects.toThrow(/400/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// capturePayPalAuthorization
// ──────────────────────────────────────────────────────────────────────────

describe("capturePayPalAuthorization", () => {
  it("throws when PayPal is not configured", async () => {
    const { capturePayPalAuthorization } = await importPaypal();
    await expect(capturePayPalAuthorization("AUTH123456")).rejects.toThrow(
      "PayPal is not configured",
    );
  });

  it("returns captureId and status on success", async () => {
    setCredentials();
    mockToken();
    mockApiOk({ id: "CAPTUREID999", status: "COMPLETED" });
    const { capturePayPalAuthorization } = await importPaypal();
    const result = await capturePayPalAuthorization("AUTH123456");
    expect(result.captureId).toBe("CAPTUREID999");
    expect(result.status).toBe("COMPLETED");
  });

  it("throws when the API call fails", async () => {
    setCredentials();
    mockToken();
    mockApiError(422, "Authorization already captured");
    const { capturePayPalAuthorization } = await importPaypal();
    await expect(capturePayPalAuthorization("AUTH123456")).rejects.toThrow(/422/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// voidPayPalAuthorization
// ──────────────────────────────────────────────────────────────────────────

describe("voidPayPalAuthorization", () => {
  it("is a no-op when PayPal is not configured", async () => {
    const { voidPayPalAuthorization } = await importPaypal();
    await expect(voidPayPalAuthorization("AUTH123456")).resolves.toBeUndefined();
    // No fetch calls should have been made
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves without throwing on a 422 response (already voided)", async () => {
    setCredentials();
    mockToken();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, text: async () => "already voided" });
    const { voidPayPalAuthorization } = await importPaypal();
    await expect(voidPayPalAuthorization("AUTH123456")).resolves.toBeUndefined();
  });

  it("throws on non-422 error responses", async () => {
    setCredentials();
    mockToken();
    mockApiError(500, "Internal Server Error");
    const { voidPayPalAuthorization } = await importPaypal();
    await expect(voidPayPalAuthorization("AUTH123456")).rejects.toThrow(/500/);
  });

  it("resolves on a successful void (204/200)", async () => {
    setCredentials();
    mockToken();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => "" });
    const { voidPayPalAuthorization } = await importPaypal();
    await expect(voidPayPalAuthorization("AUTH123456")).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// refundPayPalCapture
// ──────────────────────────────────────────────────────────────────────────

describe("refundPayPalCapture", () => {
  it("throws when PayPal is not configured", async () => {
    const { refundPayPalCapture } = await importPaypal();
    await expect(refundPayPalCapture("CAPTURE123")).rejects.toThrow(
      "PayPal is not configured",
    );
  });

  it("returns refundId and status on success (no amount)", async () => {
    setCredentials();
    mockToken();
    mockApiOk({ id: "REFUNDID111", status: "COMPLETED" });
    const { refundPayPalCapture } = await importPaypal();
    const result = await refundPayPalCapture("CAPTURE123");
    expect(result.refundId).toBe("REFUNDID111");
    expect(result.status).toBe("COMPLETED");
  });

  it("includes the amount in the request body when provided", async () => {
    setCredentials();
    mockToken();
    mockApiOk({ id: "REFUNDID222", status: "COMPLETED" });
    const { refundPayPalCapture } = await importPaypal();
    await refundPayPalCapture("CAPTURE123", 12.5);
    // Find the capture call (second fetch call after token)
    const captureCall = fetchMock.mock.calls[1];
    const body = JSON.parse(captureCall[1].body as string);
    expect(body.amount).toEqual({ currency_code: "USD", value: "12.50" });
  });

  it("sends an empty body when no amount is provided", async () => {
    setCredentials();
    mockToken();
    mockApiOk({ id: "REFUNDID333", status: "COMPLETED" });
    const { refundPayPalCapture } = await importPaypal();
    await refundPayPalCapture("CAPTURE123");
    const captureCall = fetchMock.mock.calls[1];
    const body = JSON.parse(captureCall[1].body as string);
    expect(body.amount).toBeUndefined();
  });

  it("throws when the API call fails", async () => {
    setCredentials();
    mockToken();
    mockApiError(400, "Already refunded");
    const { refundPayPalCapture } = await importPaypal();
    await expect(refundPayPalCapture("CAPTURE123")).rejects.toThrow(/400/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// verifyPayPalWebhookSignature
// ──────────────────────────────────────────────────────────────────────────

describe("verifyPayPalWebhookSignature", () => {
  const params = {
    authAlgo: "SHA256withRSA",
    certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT123",
    transmissionId: "TX123",
    transmissionSig: "SIG123",
    transmissionTime: "2024-01-01T00:00:00Z",
    webhookId: "WEBHOOK123",
    webhookEvent: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
  };

  it("returns false when PayPal is not configured", async () => {
    const { verifyPayPalWebhookSignature } = await importPaypal();
    await expect(verifyPayPalWebhookSignature(params)).resolves.toBe(false);
  });

  it("returns true when verification_status is SUCCESS", async () => {
    setCredentials();
    mockToken();
    mockApiOk({ verification_status: "SUCCESS" });
    const { verifyPayPalWebhookSignature } = await importPaypal();
    await expect(verifyPayPalWebhookSignature(params)).resolves.toBe(true);
  });

  it("returns false when verification_status is FAILURE", async () => {
    setCredentials();
    mockToken();
    mockApiOk({ verification_status: "FAILURE" });
    const { verifyPayPalWebhookSignature } = await importPaypal();
    await expect(verifyPayPalWebhookSignature(params)).resolves.toBe(false);
  });

  it("returns false when the verification API call fails", async () => {
    setCredentials();
    mockToken();
    mockApiError(500, "Internal error");
    const { verifyPayPalWebhookSignature } = await importPaypal();
    await expect(verifyPayPalWebhookSignature(params)).resolves.toBe(false);
  });

  it("returns false when fetch throws a network error", async () => {
    setCredentials();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "T", expires_in: 3600 }),
    });
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    const { verifyPayPalWebhookSignature } = await importPaypal();
    await expect(verifyPayPalWebhookSignature(params)).resolves.toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// OAuth token caching
// ──────────────────────────────────────────────────────────────────────────

describe("OAuth token caching", () => {
  it("fetches the token only once across multiple consecutive API calls", async () => {
    setCredentials();

    // Token + first authorize
    mockToken();
    mockApiOk({
      status: "COMPLETED",
      purchase_units: [
        { payments: { authorizations: [{ id: "AUTH1", status: "CREATED" }] } },
      ],
    });
    // Second authorize reuses the cached token (no extra token fetch)
    mockApiOk({
      status: "COMPLETED",
      purchase_units: [
        { payments: { authorizations: [{ id: "AUTH2", status: "CREATED" }] } },
      ],
    });

    const { authorizePayPalOrder } = await importPaypal();
    await authorizePayPalOrder("ORDER1234567");
    await authorizePayPalOrder("ORDER7654321");

    // Should be 3 total calls: 1 token + 2 API calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const tokenCalls = fetchMock.mock.calls.filter((c) =>
      /\/v1\/oauth2\/token$/.test(c[0] as string),
    );
    expect(tokenCalls).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// OAuth token error handling
// ──────────────────────────────────────────────────────────────────────────

describe("OAuth token error handling", () => {
  it("throws a descriptive error when the token endpoint returns a non-ok response", async () => {
    setCredentials();

    // Make the token fetch fail with a 401 response
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const { authorizePayPalOrder } = await importPaypal();
    await expect(authorizePayPalOrder("ORDER1234567")).rejects.toThrow(
      /PayPal token error 401/,
    );
  });

  it("includes the response body text in the token error message", async () => {
    setCredentials();

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "invalid_client",
    });

    const { createPayPalOrder } = await importPaypal();
    const params = {
      bookId: 1,
      buyerId: 2,
      sellerId: 3,
      amount: 10.0,
      returnUrl: "https://app.com/return",
      cancelUrl: "https://app.com/cancel",
    };
    await expect(createPayPalOrder(params)).rejects.toThrow(/invalid_client/);
  });
});
