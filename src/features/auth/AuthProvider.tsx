"use client";

import { createContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { EmailVerificationBanner } from "@/features/auth/EmailVerificationBanner";
import { signOut } from "@/features/auth/logout";
import { AUTH_DISABLED, ensureDevBypassSession } from "@/features/auth/dev-auth-bypass";

export const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * The one place that decides "is this device logged in." Wraps the
 * authenticated app shell (src/app/(app)/layout.tsx) so every screen under
 * it can call useCurrentUser() and get a resolved user synchronously,
 * instead of every screen separately handling a loading/no-session state.
 * See docs/RESEARCH-AND-PLAN.md Phase 2 item 14 and PRD Section 10.3.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Writes aren't allowed inside a useLiveQuery callback (Dexie throws
  // ReadOnlyError), so the bypass provisioning runs once here instead; the
  // liveQuery below just re-reads once these rows land.
  useEffect(() => {
    if (AUTH_DISABLED) ensureDevBypassSession();
  }, []);

  const resolved = useLiveQuery(async () => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    if (!session) {
      // No session row at all: distinguish "known device, just log back in
      // via PIN" from "this device has never created an account."
      const users = await db.localUsers.toArray();
      return users.length > 0 ? { kind: "no-session" as const } : { kind: "no-account" as const };
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) return { kind: "expired" as const };
    const user = await db.localUsers.get(session.userId);
    if (!user || !user.isActive) return { kind: "no-session" as const };
    return {
      kind: "active" as const,
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    };
  }, []);

  useEffect(() => {
    if (!resolved) return;
    // A previously-unlocked device just needs its PIN re-entered, not the
    // full email/password login screen.
    if (resolved.kind === "expired") router.replace("/unlock");
    if (resolved.kind === "no-session") router.replace("/unlock");
    if (resolved.kind === "no-account") router.replace("/register");
    if (resolved.kind === "active" && resolved.user.role === "super_admin") {
      router.replace("/admin");
    }
  }, [resolved, router]);

  if (!resolved || resolved.kind !== "active") {
    return (
      <div className="flex min-h-full flex-1 flex-col gap-3 px-4 py-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  // Force unverified owners to complete verification before accessing any app views
  if (resolved.user.role === "owner" && !resolved.user.emailVerified) {
    return (
      <div className="flex min-h-screen w-screen flex-col items-center justify-center p-6 bg-surface-container/20">
        <div className="w-full max-w-md">
          <EmailVerificationBanner userId={resolved.user.id} />
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.replace("/login?force=true");
              }}
              className="text-[length:var(--font-size-body)] font-semibold text-brand-accent hover:underline min-h-[var(--touch-target-min)] px-2"
            >
              Sign out / Switch account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <CurrentUserContext.Provider value={resolved.user}>{children}</CurrentUserContext.Provider>;
}
