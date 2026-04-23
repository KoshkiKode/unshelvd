import { getPlatform, isNative } from "./native";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBase(): string {
  // Running inside a native Capacitor app
  if (isNative()) {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) {
      // In a production native build the API URL must be HTTPS so that all
      // traffic is encrypted in transit (important on public WiFi / untrusted networks).
      if (import.meta.env.PROD && !envUrl.startsWith("https://")) {
        console.error(
          "❌ SECURITY: VITE_API_URL must use https:// in production native builds. " +
          "The configured URL does not use HTTPS — network traffic will be unencrypted.",
        );
      }
      return trimTrailingSlash(envUrl);
    }

    // No VITE_API_URL set — production native builds will use an insecure local address
    // and fail to reach the server.  Log a loud error to catch misconfigured CI builds.
    if (import.meta.env.PROD) {
      console.error(
        "❌ SECURITY: VITE_API_URL is not set for this production native build. " +
        "API calls will fall back to an insecure local address and will not reach the server.",
      );
    }

    if (getPlatform() === "android") return "http://10.0.2.2:5000";
    return "http://localhost:5000";
  }

  // Explicit API URL override for web builds
  if (import.meta.env.VITE_API_URL) {
    return trimTrailingSlash(import.meta.env.VITE_API_URL);
  }

  // Local web/dev/prod same-origin API
  return "";
}

export const API_BASE = getApiBase();

/**
 * Build a WebSocket URL (ws:// or wss://) that targets the same backend host
 * as the REST API.  Centralised so that callers don't accidentally derive the
 * scheme from `window.location.protocol`, which is wrong inside Capacitor
 * (`capacitor://localhost` on iOS, `http://localhost` on Android emulator)
 * even when the API is served over HTTPS.
 *
 * @param path  WebSocket path, e.g. "/ws".  A leading slash is added if missing.
 */
export function getWebSocketUrl(path = "/ws"): string {
  const normalisedPath = path.startsWith("/") ? path : `/${path}`;

  // 1. Explicit override (rare; kept for parity with REST escape hatches).
  const wsOverride = import.meta.env.VITE_WS_URL;
  if (wsOverride) {
    return `${trimTrailingSlash(wsOverride)}${normalisedPath}`;
  }

  // 2. Native or any build with an explicit API base — derive scheme from it
  //    so we always upgrade to wss:// when the API is served over HTTPS.
  if (API_BASE) {
    try {
      const apiUrl = new URL(API_BASE);
      const wsProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
      return `${wsProtocol}//${apiUrl.host}${normalisedPath}`;
    } catch {
      // Fall through to same-origin handling below.
    }
  }

  // 3. Same-origin web build — derive from the page URL.
  if (typeof window !== "undefined" && window.location) {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}${normalisedPath}`;
  }

  // 4. SSR / non-browser fallback (defensive — there is no DOM at this point).
  return `ws://localhost:5000${normalisedPath}`;
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    return res.ok;
  } catch (err) {
    console.error("Backend health check failed:", err);
    return false;
  }
}
