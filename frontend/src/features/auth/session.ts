import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { getDeviceId } from "@/features/auth/device-id";
import {
  clearFastPathAuthSession,
  updateFastPathAuthSessionExpiry,
  writeFastPathAuthSession,
} from "@/features/auth/auth-session-sync";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { WORKER_CAPABILITIES, type WorkerCapability } from "@/features/auth/authorization";

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

/** Writes/refreshes the local session and synchronizes the fast-path mirror. */
export async function startSession(userId: string, userOverride?: CurrentUser): Promise<void> {
  const expiresAt = sessionExpiryFromNow();
  await db.session.put({
    id: SESSION_SINGLETON_ID,
    userId,
    deviceId: getDeviceId(),
    expiresAt,
  });

  if (userOverride) {
    writeFastPathAuthSession(userOverride, expiresAt);
  } else {
    try {
      const localUser = await db.localUsers.get(userId);
      if (localUser && localUser.isActive && localUser.accountType) {
        const currentUser: CurrentUser = {
          id: localUser.id,
          fullName: localUser.fullName,
          emailVerified: localUser.emailVerified,
          accountType: localUser.accountType,
          permissions: (localUser.permissions ?? []).filter((p): p is WorkerCapability =>
            (WORKER_CAPABILITIES as readonly string[]).includes(p)
          ),
          businessId: localUser.businessId,
          branchIds: localUser.branchIds ?? [],
          businessStatus: localUser.businessStatus,
        };
        writeFastPathAuthSession(currentUser, expiresAt);
      }
    } catch {
      // Non-blocking mirror hydration
    }
  }
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
  const newExpiry = sessionExpiryFromNow();
  await db.session.update(SESSION_SINGLETON_ID, { expiresAt: newExpiry });
  updateFastPathAuthSessionExpiry(newExpiry);
}

export async function clearSession(): Promise<void> {
  await db.session.delete(SESSION_SINGLETON_ID);
  clearFastPathAuthSession();
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
