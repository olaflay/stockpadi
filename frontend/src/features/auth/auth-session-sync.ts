import type { CurrentUser } from "@/features/auth/use-current-user";

export const AUTH_SESSION_SYNC_KEY = "auth-session-sync";

/**
 * Two-Tier Fast-Path Auth Session Mirror.
 *
 * This mirror is stored in localStorage synchronously so on cold launches,
 * AuthProvider can hydrate user identity and app shell authorization in 0ms,
 * completely bypassing initial async IndexedDB connection overhead, Dexie
 * subscription scheduling, and flash storage I/O delays.
 */
export interface FastPathAuthSession {
  version: 1;
  userId: string;
  expiresAt: string;
  user: CurrentUser;
  cachedAt: string;
}

/**
 * Synchronously reads the fast-path authentication session from localStorage.
 * Returns null if not in a browser, not present, expired, or malformed.
 */
export function readFastPathAuthSession(): FastPathAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_SYNC_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as FastPathAuthSession;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.userId || !parsed.expiresAt || !parsed.user) return null;

    const expiryTime = new Date(parsed.expiresAt).getTime();
    if (Number.isNaN(expiryTime) || expiryTime <= Date.now()) {
      return null;
    }

    if (!parsed.user.id || !parsed.user.accountType) {
      return null;
    }

    return parsed;
  } catch (err) {
    console.warn("[FastPathAuth] Failed to read auth session sync mirror:", err);
    return null;
  }
}

/**
 * Synchronously writes or overwrites the fast-path auth session mirror.
 */
export function writeFastPathAuthSession(user: CurrentUser, expiresAt: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload: FastPathAuthSession = {
      version: 1,
      userId: user.id,
      expiresAt,
      user,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(AUTH_SESSION_SYNC_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("[FastPathAuth] Failed to write auth session sync mirror:", err);
  }
}

/**
 * Updates the expiry timestamp of the existing fast-path session mirror.
 */
export function updateFastPathAuthSessionExpiry(expiresAt: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = readFastPathAuthSession();
    if (current) {
      current.expiresAt = expiresAt;
      current.cachedAt = new Date().toISOString();
      window.localStorage.setItem(AUTH_SESSION_SYNC_KEY, JSON.stringify(current));
    }
  } catch (err) {
    console.warn("[FastPathAuth] Failed to update session expiry:", err);
  }
}

/**
 * Updates user profile attributes (such as verification status or branch access)
 * in the active fast-path mirror without altering session validity.
 */
export function updateFastPathAuthUser(updates: Partial<CurrentUser>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readFastPathAuthSession();
    if (current && current.user) {
      current.user = { ...current.user, ...updates };
      current.cachedAt = new Date().toISOString();
      window.localStorage.setItem(AUTH_SESSION_SYNC_KEY, JSON.stringify(current));
    }
  } catch (err) {
    console.warn("[FastPathAuth] Failed to update user in auth mirror:", err);
  }
}

/**
 * Clears the fast-path authentication session mirror upon explicit logout or expiry.
 */
export function clearFastPathAuthSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_SESSION_SYNC_KEY);
  } catch (err) {
    console.warn("[FastPathAuth] Failed to clear auth session sync mirror:", err);
  }
}
