import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Safe Capacitor import — returns null in browser environments
let Capacitor: { isNativePlatform: () => boolean; getPlatform: () => string } | null = null;
try {
  const cap = await import("@capacitor/core");
  Capacitor = cap.Capacitor;
} catch {
  // Not in a Capacitor environment (normal browser) — that's fine
}

/**
 * API base URL resolution:
 * 
 * 1. Deployed web: __PORT_5000__ is replaced at deploy time with the proxy path
 * 2. Local dev (browser): empty string → relative URLs → same origin (localhost:5000)
 * 3. Capacitor native app: uses VITE_API_URL env var → your Cloud Run / production server
 * 4. Fallback for native: if no env var set, tries localhost (useful for dev with `cap run`)
 */
function getApiBase(): string {
  // Deployed web — the deploy tool replaces __PORT_5000__ with the proxy path
  const deployMarker = "__PORT_5000__";
  if (!deployMarker.startsWith("__")) {
    return deployMarker;
  }

  // Running inside a native Capacitor app
  if (Capacitor?.isNativePlatform()) {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl;
    
    // In production builds, this is a serious configuration error
    if (import.meta.env.PROD) {
      console.error("FATAL: VITE_API_URL is missing in a production native build!");
    }

    if (Capacitor.getPlatform() === "android") return "http://10.0.2.2:5000";
    return "http://localhost:5000";
  }

  // Check for VITE_API_URL even in browser (useful for testing)
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  // Local web dev — relative URLs hit the same origin
  return "";
}

export const API_BASE = getApiBase();

/**
 * Performs a simple ping to verify backend connectivity
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      method: "GET",
      credentials: "include",
    });
    // Even a 401 Unauthorized means the server is reachable and responding
    return res.status === 200 || res.status === 401;
  } catch (err) {
    console.error("Backend health check failed:", err);
    return false;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
