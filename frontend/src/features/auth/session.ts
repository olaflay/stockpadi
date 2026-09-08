import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { getDeviceId } from "@/features/auth/device-id";

/**
 * How long the local device session lasts without any use.
 * Resets to this duration every time the user opens the app (refreshSession).
 * They will only need to log in again after 30 days of complete inactivity.
 */
const SESSION_DURATION_DAYS = 30;
const SESSION_DURATION_HOURS = SESSION_DURATION_DAYS * 24;

export function sessionExpiryFromNow(): string {
  return new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000).toISOString();
}

/** Writes/refreshes the local session after a successful online login. */
export async function startSession(userId: string): Promise<void> {
  await db.session.put({
    id: SESSION_SINGLETON_ID,
    userId,
    deviceId: getDeviceId(),
    expiresAt: sessionExpiryFromNow(),
  });
}

/**
 * Slides the local session expiry forward by SESSION_DURATION_DAYS from now.
 * Called by AuthProvider on every active app visit so the session stays alive
 * as long as the user keeps using the app. The session only truly expires after
 * SESSION_DURATION_DAYS of complete inactivity (app not opened at all).
 */
export async function refreshSession(): Promise<void> {
  const session = await db.session.get(SESSION_SINGLETON_ID);
  if (!session) return; // Nothing to refresh — no active session
  await db.session.update(SESSION_SINGLETON_ID, { expiresAt: sessionExpiryFromNow() });
}

export async function clearSession(): Promise<void> {
  await db.session.delete(SESSION_SINGLETON_ID);
}

export type SessionState =
  | { status: "no-session" }
  | { status: "expired" }
  | { status: "active"; userId: string };

export async function readSessionState(): Promise<SessionState> {
  const session = await db.session.get(SESSION_SINGLETON_ID);
  if (!session) return { status: "no-session" };
  if (new Date(session.expiresAt).getTime() < Date.now()) return { status: "expired" };
  return { status: "active", userId: session.userId };
}
