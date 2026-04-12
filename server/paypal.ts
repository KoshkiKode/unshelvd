/**
 * Unshelv'd — PayPal REST API Integration
 *
 * Uses PayPal's v2 Orders API (no external SDK required).
 * Credentials are loaded from platform_settings (admin-configured) with a
 * fallback to environment variables.
 *
 * Supported flows:
 *   1. Create order  → buyer is redirected to PayPal to approve
 *   2. Capture order → called after buyer approves
 *   3. Refund        → refund a completed capture
 *
 * Environment / DB settings:
 *   paypal_client_id     — app client ID
 *   paypal_client_secret — app client secret
 *   paypal_mode          — "sandbox" | "live"  (default: "sandbox")
 *   paypal_enabled       — "true" | "false"    (default: false)
 */

import { getSetting, isEnabled } from "./platform-settings";

// ── Input validation ───────────────────────────────────────────────────────

/**
 * PayPal order/capture IDs are alphanumeric uppercase strings (up to 20 chars).
 * Validate before embedding in a URL to prevent request-forgery.
 */
function validatePayPalId(id: string, label = "PayPal ID"): void {
  if (!/^[A-Z0-9]{1,22}$/.test(id)) {
    throw new Error(`Invalid ${label}: must be alphanumeric uppercase (max 22 chars)`);
  }
}

// ── PayPal API base URLs ───────────────────────────────────────────────────

function getBaseUrl(mode: string) {
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

// ── Credentials ───────────────────────────────────────────────────────────

async function getPayPalCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  mode: string;
} | null> {
  const clientId =
    (await getSetting("paypal_client_id")) || process.env.PAYPAL_CLIENT_ID || null;
  const clientSecret =
    (await getSetting("paypal_client_secret")) ||
    process.env.PAYPAL_CLIENT_SECRET ||
    null;
  const mode = (await getSetting("paypal_mode")) || "sandbox";

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, mode };
}

export async function isPayPalEnabled(): Promise<boolean> {
  const enabled = await isEnabled("paypal_enabled", false);
  if (!enabled) return false;
  const creds = await getPayPalCredentials();
  return creds !== null;
}

// ── OAuth access token ─────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
  mode: string;
}

let _tokenCache: TokenCache | null = null;

async function getAccessToken(creds: {
  clientId: string;
  clientSecret: string;
  mode: string;
}): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.mode === creds.mode && _tokenCache.expiresAt > now + 30_000) {
    return _tokenCache.accessToken;
  }

  const base = getBaseUrl(creds.mode);
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal token error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  _tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
    mode: creds.mode,
  };
  return data.access_token;
}

// ── PayPal Orders API ─────────────────────────────────────────────────────

/**
 * Create a PayPal order for a book purchase.
 * Returns the order ID and approval URL the buyer should be redirected to.
 */
export async function createPayPalOrder(params: {
  bookId: number;
  buyerId: number;
  sellerId: number;
  amount: number; // USD
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ orderId: string; approveUrl: string }> {
  const creds = await getPayPalCredentials();
  if (!creds) throw new Error("PayPal is not configured");

  const token = await getAccessToken(creds);
  const base = getBaseUrl(creds.mode);

  const body = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: `book_${params.bookId}_buyer_${params.buyerId}`,
        amount: {
          currency_code: "USD",
          value: params.amount.toFixed(2),
        },
        description: `Book purchase #${params.bookId}`,
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
        },
      },
    },
  };

  const res = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal create-order error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    links: { href: string; rel: string }[];
  };

  const approveLink = data.links.find((l) => l.rel === "payer-action");
  if (!approveLink) throw new Error("PayPal did not return an approval URL");

  return { orderId: data.id, approveUrl: approveLink.href };
}

/**
 * Authorize an approved PayPal order (escrow step 1).
 * Funds are held on the buyer's account but NOT yet transferred to us.
 * Returns the authorization ID — store it on the transaction for capture later.
 */
export async function authorizePayPalOrder(
  orderId: string,
): Promise<{ authorizationId: string; status: string }> {
  validatePayPalId(orderId, "order ID");
  const creds = await getPayPalCredentials();
  if (!creds) throw new Error("PayPal is not configured");

  const token = await getAccessToken(creds);
  const base = getBaseUrl(creds.mode);

  const res = await fetch(`${base}/v2/checkout/orders/${orderId}/authorize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal authorize error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    status: string;
    purchase_units: {
      payments: { authorizations: { id: string; status: string }[] };
    }[];
  };

  const auth = data.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error("PayPal authorize response missing authorization data");

  return { authorizationId: auth.id, status: auth.status };
}

/**
 * Capture a previously-authorized PayPal payment (escrow step 2).
 * Call this when the buyer confirms delivery so funds move to our account.
 * Returns the capture ID — store it on the transaction for potential refunds.
 */
export async function capturePayPalAuthorization(
  authorizationId: string,
): Promise<{ captureId: string; status: string }> {
  validatePayPalId(authorizationId, "authorization ID");
  const creds = await getPayPalCredentials();
  if (!creds) throw new Error("PayPal is not configured");

  const token = await getAccessToken(creds);
  const base = getBaseUrl(creds.mode);

  const res = await fetch(`${base}/v2/payments/authorizations/${authorizationId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal capture-authorization error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: string; status: string };
  return { captureId: data.id, status: data.status };
}

/**
 * Void (cancel) a PayPal authorization — used when a transaction is cancelled
 * before delivery so the hold on the buyer's account is released.
 */
export async function voidPayPalAuthorization(
  authorizationId: string,
): Promise<void> {
  validatePayPalId(authorizationId, "authorization ID");
  const creds = await getPayPalCredentials();
  if (!creds) return; // nothing to void if PayPal isn't configured

  const token = await getAccessToken(creds);
  const base = getBaseUrl(creds.mode);

  const res = await fetch(`${base}/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok && res.status !== 422) {
    // 422 means already voided/captured — treat as success
    const text = await res.text();
    throw new Error(`PayPal void-authorization error ${res.status}: ${text}`);
  }
}

/**
 * Refund a PayPal capture by its capture ID.
 */
export async function refundPayPalCapture(
  captureId: string,
  amount?: number,
): Promise<{ refundId: string; status: string }> {
  validatePayPalId(captureId, "capture ID");
  const creds = await getPayPalCredentials();
  if (!creds) throw new Error("PayPal is not configured");

  const token = await getAccessToken(creds);
  const base = getBaseUrl(creds.mode);

  const body: Record<string, unknown> = {};
  if (amount !== undefined) {
    body.amount = { currency_code: "USD", value: amount.toFixed(2) };
  }

  const res = await fetch(`${base}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal refund error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: string; status: string };
  return { refundId: data.id, status: data.status };
}
