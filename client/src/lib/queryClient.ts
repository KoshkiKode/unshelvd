import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";

/**
 * API base URL resolution:
 * 
 * 1. Deployed web (Perplexity/S3): __PORT_5000__ is replaced at deploy time with the proxy path
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
  if (Capacitor.isNativePlatform()) {
    // Set VITE_API_URL when building for production native
    // e.g., VITE_API_URL=https://unshelvd-xxxxx-uc.a.run.app npm run build
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl) return envUrl;
    // Dev fallback — Android emulator uses 10.0.2.2 to reach host machine
    if (Capacitor.getPlatform() === "android") return "http://10.0.2.2:5000";
    // iOS simulator uses localhost
    return "http://localhost:5000";
  }

  // Local web dev — relative URLs hit the same origin
  return "";
}

const API_BASE = getApiBase();

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
