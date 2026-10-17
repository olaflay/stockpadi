"use client";

import { createContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { removeLegacyTestUser } from "@/features/auth/legacy-cleanup";
import { refreshSession, sessionExpiryFromNow } from "@/features/auth/session";
import { setLocalBusinessId } from "@/lib/local-tenant";
import { WORKER_CAPABILITIES, type WorkerCapability } from "@/features/auth/authorization";
import {
  clearFastPathAuthSession,
  readFastPathAuthSession,
  writeFastPathAuthSession,
  type FastPathAuthSession,
} from "@/features/auth/auth-session-sync";
import { ensureStoragePersistence } from "@/lib/storage-persistence";

export const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * Watchdog timeout in milliseconds. If session resolution does not resolve within
 * 4,000ms and no fast-path session exists, the watchdog mounts an in-place
 * recovery modal ("App storage is taking longer than usual — Tap to reload")
 * without destroying valid credentials or forcing a logout redirect.
 */
export const AUTH_WATCHDOG_TIMEOUT_MS = 4000;

/**
 * The one place that decides "is this device logged in." Wraps the
 * authenticated app shell (src/app/(app)/layout.tsx) so every screen under
 * it can call useCurrentUser() and get a resolved user synchronously,
 * instead of every screen separately handling a loading/no-session state.
 *
 * Implements a Two-Tier Fast-Path Auth Pipeline:
 * - Tier 1: Synchronous localStorage mirror (auth-session-sync) hydrates
 *   instantly on cold start (0ms), eliminating blank skeletons and cold-boot hangs.
 * - Tier 2: Dexie IndexedDB live query runs asynchronously to keep the session
 *   refreshed and verify authoritative tenant isolation.
 * - Deadlock Recovery: Stalled storage delays NEVER trigger destructive redirects.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sessionRefreshed = useRef(false);
  const [watchdogTripped, setWatchdogTripped] = useState(false);
  const [fastPathSession, setFastPathSession] = useState<FastPathAuthSession | null>(() =>
    readFastPathAuthSession()
  );

  useEffect(() => {
    void removeLegacyTestUser();
    void ensureStoragePersistence().catch(() => false);
  }, []);

  // Hydrate tenant ID immediately if fast-path is present
  useEffect(() => {
    if (fastPathSession?.user.businessId) {
      void setLocalBusinessId(fastPathSession.user.businessId);
    }
  }, [fastPathSession]);

  const resolved = useLiveQuery(async () => {
    try {
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
    } catch (err) {
      console.warn("AuthProvider session resolution failed:", err);
      return { kind: "no-session" as const };
    }
  }, []);

  // Sync fast-path mirror when IndexedDB produces an authoritative resolution
  useEffect(() => {
    if (!resolved) return;

    if (resolved.kind === "active") {
      writeFastPathAuthSession(resolved.user, sessionExpiryFromNow());
      setFastPathSession((prev) =>
        prev?.user.id === resolved.user.id && prev.expiresAt === sessionExpiryFromNow()
          ? prev
          : {
              version: 1,
              userId: resolved.user.id,
              expiresAt: sessionExpiryFromNow(),
              user: resolved.user,
              cachedAt: new Date().toISOString(),
            }
      );
    } else if (
      resolved.kind === "expired" ||
      resolved.kind === "no-session" ||
      resolved.kind === "needs-login"
    ) {
      clearFastPathAuthSession();
      setFastPathSession(null);
    }
  }, [resolved]);

  // Determine active user across Tier 1 (fast-path) and Tier 2 (Dexie live query)
  const activeUser: CurrentUser | null =
    resolved?.kind === "active"
      ? resolved.user
      : (!resolved && fastPathSession ? fastPathSession.user : null);

  // Routing guards — only redirect when authoritative resolution requires it or for role-specific routes
  useEffect(() => {
    // If Dexie has explicitly resolved an unauthenticated state, redirect to login
    if (resolved) {
      if (
        resolved.kind === "expired" ||
        resolved.kind === "no-session" ||
        resolved.kind === "needs-login"
      ) {
        if (!pathname.startsWith("/login")) {
          router.replace("/login?force=true");
        }
        return;
      }
    }

    if (!activeUser) return;

    if (activeUser.accountType === "ADMIN") {
      if (!pathname.startsWith("/admin")) {
        router.replace("/admin");
      }
      return;
    }

    if (activeUser.accountType === "BUSINESS_OWNER") {
      // Unverified accounts can use the app locally; cloud sync is gated by verification status
      if (
        activeUser.businessStatus === "verified" &&
        !activeUser.emailVerified &&
        !pathname.startsWith("/verify-email")
      ) {
        router.replace("/verify-email");
      }
    }
  }, [resolved, activeUser, router, pathname]);

  // Non-destructive watchdog supervisor:
  // If no active user is available (neither via fast-path nor Dexie) and storage takes longer
  // than 4,000ms, mount an in-place recovery modal.
  // Storage delays are NEVER treated as authentication failures.
  useEffect(() => {
    if (activeUser) {
      setWatchdogTripped(false);
      return;
    }

    const timer = setTimeout(() => {
      setWatchdogTripped(true);
      // NOTE: We deliberately do NOT execute router.replace("/login?force=true") here.
    }, AUTH_WATCHDOG_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [activeUser]);

  // Refresh session expiry once per mount, NOT on every resolved change.
  useEffect(() => {
    if (activeUser) {
      if (activeUser.businessId) {
        void setLocalBusinessId(activeUser.businessId);
      }
      if (!sessionRefreshed.current) {
        sessionRefreshed.current = true;
        void refreshSession();
      }
    }
  }, [activeUser]);

  // Non-destructive in-place recovery UI when storage stalls
  if (watchdogTripped && !activeUser) {
    return (
      <div
        data-testid="auth-watchdog-fallback"
        className="flex h-dvh max-h-dvh w-full max-w-full flex-col items-center justify-center bg-surface px-6 text-center select-none"
      >
        <div className="w-full max-w-sm rounded-3xl bg-surface-container p-6 shadow-sm flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-brand-container/30 flex items-center justify-center text-brand">
            <svg
              className="h-6 w-6 animate-spin text-brand"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-on-surface">
              App storage is taking longer than usual — Tap to reload
            </h2>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Your session and data are safe. A quick reload will reconnect app storage.
            </p>
          </div>
          <div className="flex flex-col w-full gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-brand text-on-brand font-medium text-xs shadow-xs hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
            >
              Tap to reload
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
              className="w-full py-2 px-4 rounded-xl text-on-surface-variant hover:text-on-surface text-xs font-medium transition-colors cursor-pointer"
            >
              Reload App
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.replace("/login?force=true");
                } else {
                  router.replace("/login?force=true");
                }
              }}
              className="w-full py-1.5 text-xs text-on-surface-variant/70 hover:text-on-surface underline transition-colors cursor-pointer"
            >
              Continue to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeUser) {
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

          {/* Hero Sales Card Placeholder — borderless tonal silhouette */}
          <div className="rounded-3xl p-4 sm:p-5 flex flex-col justify-between h-32 sm:h-34 bg-surface-container/60 shadow-xs">
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

          {/* 2x2 KPI Grid Placeholder — borderless tonal silhouette */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 sm:h-26 rounded-2xl p-3 bg-surface-container/60 flex flex-col justify-between"
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

          {/* Lower Recent Activity Placeholder — borderless tonal silhouette */}
          <div className="rounded-2xl p-3 bg-surface-container/60 flex flex-col gap-2.5">
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
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border/40 bg-surface-container px-2 py-1 after:content-[''] after:absolute after:top-full after:inset-x-0 after:h-32 after:bg-surface-container after:pointer-events-none"
          style={{
            paddingBottom: "max(0.35rem, calc(env(safe-area-inset-bottom, 0px) + 0.15rem))",
          }}
          aria-hidden
        >
          {/* Downward background extension: permanently blankets the chin and overscroll area behind the home indicator */}
          <div
            aria-hidden
            className="absolute top-full inset-x-0 h-32 bg-surface-container pointer-events-none"
          />
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

  return <CurrentUserContext.Provider value={activeUser}>{children}</CurrentUserContext.Provider>;
}

