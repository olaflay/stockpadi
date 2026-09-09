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
        permissions: (user.permissions ?? []).filter((permission): permission is import("@/features/auth/authorization").WorkerCapability => permission in {
          POS_SELL: true, VIEW_PRODUCTS: true, VIEW_BRANCH_STOCK: true, VIEW_STOCK_MOVEMENTS: true,
          SUBMIT_STOCK_COUNT: true, SUBMIT_RECONCILIATION: true, VIEW_CUSTOMERS: true,
          USE_CUSTOMER_CREDIT: true, VIEW_OWN_SALES: true, VIEW_RECEIPTS: true, VIEW_ALERTS: true,
        }),
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
      <div className="flex min-h-full flex-1 flex-col gap-3 px-4 py-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return <CurrentUserContext.Provider value={resolved.user}>{children}</CurrentUserContext.Provider>;
}
