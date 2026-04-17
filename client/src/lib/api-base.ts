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
