import { getSupabase } from "@/lib/supabase";

/** A request could not reach the Node application API. */
export class NetworkUnavailableError extends Error {
  readonly code = "NETWORK_UNAVAILABLE";
  constructor(message = "The backend could not be reached.") { super(message); }
}

/** The Node application API rejected an authenticated request. */
export class BackendRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

/** A server-side caller attempted to use the client transport without config. */
export class BackendConfigurationError extends Error {
  readonly code = "BACKEND_CONFIGURATION";
  constructor(message = "The application backend is not configured.") { super(message); }
}

interface BackendErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

const REQUEST_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MS = 8_000;
const DEFAULT_READ_RETRIES = 2;
const RETRY_DELAYS_MS = [250, 750] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NetworkUnavailableError(message)), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function canRetry(error: unknown, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", attempt: number): boolean {
  if (method !== "GET" || attempt >= DEFAULT_READ_RETRIES) return false;
  if (error instanceof NetworkUnavailableError) return true;
  return error instanceof BackendRequestError && (error.status === 408 || error.status === 429 || error.status >= 500);
}

/**
 * The browser always calls the same-origin Next.js proxy. This keeps a phone
 * on a local network from resolving localhost to itself instead of to the
 * development computer. Server-side callers use NEXT_PUBLIC_BACKEND_URL.
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

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  retried = false,
  allowUnauthenticated = false,
  timeoutMs = REQUEST_TIMEOUT_MS,
  attempt = 0,
): Promise<T> {
  let token: string | null;
  try {
    token = await withTimeout(currentAccessToken(true, allowUnauthenticated), AUTH_TIMEOUT_MS, "Authentication service timed out.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          const refreshed = await withTimeout(supabase.auth.refreshSession(), AUTH_TIMEOUT_MS, "Authentication service timed out.");
          if (refreshed.data.session) return request<T>(method, path, body, true, allowUnauthenticated, timeoutMs, attempt);
        }
      }
      if (!response.ok) {
        const errorBody = result as BackendErrorBody | null;
        const error = new BackendRequestError(
          response.status,
          errorBody?.error?.code ?? `HTTP_${response.status}`,
          errorBody?.error?.message ?? "The server rejected the request.",
        );
        if (canRetry(error, method, attempt)) {
          await wait(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
          return request<T>(method, path, body, retried, allowUnauthenticated, timeoutMs, attempt + 1);
        }
        throw error;
      }
      return (result ?? {}) as T;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const normalizedError = error instanceof DOMException && error.name === "AbortError"
      ? new NetworkUnavailableError("The backend request timed out.")
      : error instanceof TypeError
        ? new NetworkUnavailableError(error.message || "The backend could not be reached.")
        : error;
    if (canRetry(normalizedError, method, attempt)) {
      await wait(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
      return request<T>(method, path, body, retried, allowUnauthenticated, timeoutMs, attempt + 1);
    }
    if (normalizedError instanceof BackendRequestError || normalizedError instanceof BackendConfigurationError || normalizedError instanceof NetworkUnavailableError) throw normalizedError;
    throw normalizedError;
  }
}

export function serverGet<T>(path: string, options?: { timeoutMs?: number }): Promise<T> {
  return request<T>("GET", path, undefined, false, false, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
}
export function serverPost<T>(path: string, body: unknown, options?: { timeoutMs?: number }): Promise<T> {
  return request<T>("POST", path, body, false, false, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
}
export function serverPostPublic<T>(path: string, body: unknown, options?: { timeoutMs?: number }): Promise<T> {
  return request<T>("POST", path, body, false, true, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
}
export function serverPut<T>(path: string, body: unknown, options?: { timeoutMs?: number }): Promise<T> {
  return request<T>("PUT", path, body, false, false, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
}
export function serverPatch<T>(path: string, body: unknown, options?: { timeoutMs?: number }): Promise<T> {
  return request<T>("PATCH", path, body, false, false, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
}
