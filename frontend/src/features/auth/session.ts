import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { getDeviceId } from "@/features/auth/device-id";

/** Local session duration before the user signs in again. */
const SESSION_DURATION_HOURS = 24;

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
