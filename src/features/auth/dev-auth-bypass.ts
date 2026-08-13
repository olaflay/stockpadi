import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { startSession } from "@/features/auth/session";
import { hashPin } from "@/lib/pin-hash";
import type { Role } from "@/types/roles";

/**
 * TEMPORARY testing switch — flip back to false to restore normal
 * register/login/PIN gating. While true, every device auto-provisions a
 * local "Test Owner" account and skips straight into the app: no cloud
 * account, no PIN, no session expiry. Cloud sync will NOT work in this mode
 * since Supabase RLS requires a real authenticated session, so this is for
 * local feature testing only, not for sharing the deployed link publicly.
 */
export const AUTH_DISABLED = true;

/** Google OAuth isn't wired up in Google Cloud Console / Supabase yet — hide the buttons until it is. */
export const GOOGLE_AUTH_ENABLED = false;

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureDevBypassSession(): Promise<void> {
  const existing = await db.localUsers.get(DEV_USER_ID);
  if (!existing) {
    await db.localUsers.put({
      id: DEV_USER_ID,
      fullName: "Test Owner",
      role: "owner" as Role,
      pinHash: await hashPin("0000"),
      isActive: true,
      emailVerified: true,
      updatedAt: new Date().toISOString(),
    });
  }

  const profile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
  if (!profile) {
    await db.businessProfile.put({
      id: BUSINESS_PROFILE_SINGLETON_ID,
      name: "Test Store",
      businessTypeId: "general_retail",
      currency: "NGN",
    });
  }

  await startSession(DEV_USER_ID);
}
