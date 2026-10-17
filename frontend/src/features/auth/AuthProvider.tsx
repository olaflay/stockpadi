"use client";

import { createContext, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { removeLegacyTestUser } from "@/features/auth/legacy-cleanup";
import { refreshSession } from "@/features/auth/session";
import { setLocalBusinessId } from "@/lib/local-tenant";
import { WORKER_CAPABILITIES, type WorkerCapability } from "@/features/auth/authorization";

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
  const pathname = usePathname();
  const sessionRefreshed = useRef(false);

  useEffect(() => { void removeLegacyTestUser(); }, []);

  const resolved = useLiveQuery(async () => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    if (!session) {
      return { kind: "needs-login" as const };
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) return { kind: "expired" as const };
    const user = await db.localUsers.get(session.userId);
    if (!user || !user.isActive || !user.accountType) return { kind: "no-session" as const };
    return {
      kind: "active" as const,
      user: {
        id: user.id,
        fullName: user.fullName,
        emailVerified: user.emailVerified,
        accountType: user.accountType,
        permissions: (user.permissions ?? []).filter((permission): permission is WorkerCapability =>
          (WORKER_CAPABILITIES as readonly string[]).includes(permission)
        ),
        businessId: user.businessId,
        branchIds: user.branchIds ?? [],
        businessStatus: user.businessStatus,
      },
    };
  }, []);

  // Routing guards — only redirect when not already on the target page
  useEffect(() => {
    if (!resolved) return;
    if (resolved.kind === "expired" || resolved.kind === "no-session" || resolved.kind === "needs-login") {
      if (!pathname.startsWith("/login")) {
        router.replace("/login?force=true");
      }
      return;
    }
    if (resolved.kind === "active" && resolved.user.accountType === "ADMIN") {
      if (!pathname.startsWith("/admin")) {
        router.replace("/admin");
      }
      return;
    }
    if (resolved.kind === "active" && resolved.user.accountType === "BUSINESS_OWNER") {
      // Unverified accounts can use the app locally; cloud sync is gated by verification status
      if (resolved.user.businessStatus === "verified" && !resolved.user.emailVerified && !pathname.startsWith("/verify-email")) {
        router.replace("/verify-email");
      }
    }
  }, [resolved, router, pathname]);

  // Refresh session expiry once per mount, NOT on every resolved change.
  // Writing to db.session inside a dependency of the same useLiveQuery that
  // produces `resolved` would create an infinite re-render loop.
  useEffect(() => {
    if (resolved?.kind === "active") {
      if (resolved.user.businessId) {
        void setLocalBusinessId(resolved.user.businessId);
      }
      if (!sessionRefreshed.current) {
        sessionRefreshed.current = true;
        void refreshSession();
      }
    }
  }, [resolved]);

  if (!resolved || resolved.kind !== "active") {
    return (
      <div className="flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden bg-surface select-none">
        {/* Top green brand header skeleton matching TopStoreHeader */}
        <header
          className="sticky top-0 left-0 right-0 z-40 flex w-full flex-col shadow-xs bg-[var(--brand-accent-configured,var(--color-brand-accent,#0a6e4d))]"
          aria-hidden
        >
          <div className="w-full flex h-11 sm:h-12 items-center justify-between px-4 sm:px-6 max-w-xl md:max-w-2xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-white/20 animate-shimmer" />
              <div className="h-4.5 w-24 rounded-md bg-white/25 animate-shimmer" />
            </div>
            <div className="h-5 w-16 rounded-full bg-white/20 animate-shimmer" />
          </div>
        </header>

        {/* Main content body filled across the viewport */}
        <main className="min-w-0 flex-1 flex flex-col overflow-y-auto px-4 sm:px-6 pt-2 sm:pt-2.5 w-full max-w-xl md:max-w-2xl mx-auto gap-3 pb-18 sm:pb-20">
          {/* Status banner placeholder */}
          <div className="flex items-center justify-center py-0.5">
            <Skeleton className="h-4 w-40 rounded-full" />
          </div>

          {/* Hero Sales Card Placeholder */}
          <div className="rounded-3xl p-4 sm:p-5 flex flex-col justify-between h-32 sm:h-34 bg-surface-container/60 border border-outline-variant/20 shadow-xs">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-8 w-44 rounded-lg my-1" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-3.5 w-18 rounded" />
            </div>
          </div>

          {/* Quick Actions Dock Placeholder */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 sm:h-18 rounded-2xl" />
            ))}
          </div>

          {/* 2x2 KPI Grid Placeholder */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 sm:h-26 rounded-2xl p-3 bg-surface-container/60 border border-outline-variant/20 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-16 rounded" />
                  <Skeleton className="h-3.5 w-3.5 rounded-full" />
                </div>
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-3 w-14 rounded" />
              </div>
            ))}
          </div>

          {/* Lower Recent Activity Placeholder to fill the screen */}
          <div className="rounded-2xl p-3 bg-surface-container/60 border border-outline-variant/20 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-28 rounded" />
              <Skeleton className="h-3.5 w-12 rounded" />
            </div>
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </main>

        {/* Bottom Navigation Dock Placeholder */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border/30 bg-surface/90 backdrop-blur-md px-2 py-1"
          style={{
            paddingBottom: "max(0.35rem, calc(env(safe-area-inset-bottom, 0px) + 0.15rem))",
          }}
          aria-hidden
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex min-h-[42px] flex-1 flex-col items-center justify-center gap-0.5 py-1">
              <Skeleton className="h-7 w-12 sm:w-14 rounded-full" />
              <Skeleton className="h-2.5 w-8 rounded" />
            </div>
          ))}
        </nav>
      </div>
    );
  }

  return <CurrentUserContext.Provider value={resolved.user}>{children}</CurrentUserContext.Provider>;
}
