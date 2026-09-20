import { getSupabase } from "@/lib/supabase";

export class NetworkUnavailableError extends Error {
  readonly code = "NETWORK_UNAVAILABLE";
  constructor(message = "The backend could not be reached.") { super(message); }
}

export class BackendRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export class BackendConfigurationError extends Error {
  readonly code = "BACKEND_CONFIGURATION";
  constructor(message = "The application backend is not configured.") { super(message); }
}

interface BackendErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Browser requests stay on the frontend origin and are forwarded by the
 * Next.js `/api` rewrite. This is important for local multi-device testing:
 * an absolute `http://localhost:8787` URL would point at the phone/tablet
 * itself instead of the computer running StockPadi. Server-side callers still
 * need the configured absolute backend URL.
 */
function requestUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ?? (process.env.NODE_ENV === "test" ? "http://backend.test" : undefined);
  if (!backendUrl) throw new BackendConfigurationError("The application backend is not configured.");
  return `${backendUrl}${path}`;
}

async function currentAccessToken(allowRefresh: boolean, allowUnauthenticated = false): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) throw new BackendConfigurationError("Supabase authentication is not configured.");
  const sessionResult = await supabase.auth.getSession();
  if (sessionResult.data.session) return sessionResult.data.session.access_token;
  if (allowRefresh && typeof supabase.auth.refreshSession === "function") {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.data.session) return refreshed.data.session.access_token;
  }
  if (allowUnauthenticated) return null;
  throw new BackendConfigurationError("Your session has expired. Sign in again.");
}

async function request<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown, retried = false, allowUnauthenticated = false): Promise<T> {
  const token = await currentAccessToken(true, allowUnauthenticated);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl(path), {
      method,
      signal: controller.signal,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let result: T | BackendErrorBody | null = null;
    try { result = await response.json() as T | BackendErrorBody; } catch { result = null; }
    if (response.status === 401 && !retried) {
      const supabase = getSupabase();
      if (supabase && typeof supabase.auth.refreshSession === "function") {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.data.session) return request<T>(method, path, body, true);
      }
    }
    if (!response.ok) {
      const errorBody = result as BackendErrorBody | null;
      throw new BackendRequestError(
        response.status,
        errorBody?.error?.code ?? `HTTP_${response.status}`,
        errorBody?.error?.message ?? "The server rejected the request.",
      );
    }
    return (result ?? {}) as T;
  } catch (error) {
    if (error instanceof BackendRequestError || error instanceof BackendConfigurationError || error instanceof NetworkUnavailableError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new NetworkUnavailableError("The backend request timed out.");
    if (error instanceof TypeError) throw new NetworkUnavailableError(error.message || "The backend could not be reached.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function serverGet<T>(path: string): Promise<T> { return request<T>("GET", path); }
export function serverPost<T>(path: string, body: unknown): Promise<T> { return request<T>("POST", path, body); }
export function serverPostPublic<T>(path: string, body: unknown): Promise<T> { return request<T>("POST", path, body, false, true); }
export function serverPut<T>(path: string, body: unknown): Promise<T> { return request<T>("PUT", path, body); }
export function serverPatch<T>(path: string, body: unknown): Promise<T> { return request<T>("PATCH", path, body); }
