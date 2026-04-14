import { getPlatform, isNative } from "./native";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getApiBase(): string {
  // Running inside a native Capacitor app
  if (isNative()) {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return trimTrailingSlash(envUrl);

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
