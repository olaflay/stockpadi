"use client";

import { createContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { removeLegacyTestUser } from "@/features/auth/legacy-cleanup";
import { refreshSession } from "@/features/auth/session";

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

  useEffect(() => { void removeLegacyTestUser(); }, []);

  const resolved = useLiveQuery(async () => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    if (!session) {
      // Every account now returns to the normal online login flow when the
      // local session is missing or expired; the normal online login flow is required.
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
      },
    };
  }, []);

  useEffect(() => {
    if (!resolved) return;
    // A missing or expired local session must be re-established through the
    // normal Supabase email/password login flow.
    if (resolved.kind === "expired") router.replace("/login?force=true");
    if (resolved.kind === "no-session") router.replace("/login?force=true");
    if (resolved.kind === "needs-login") router.replace("/login?force=true");
    if (resolved.kind === "active" && resolved.user.accountType === "ADMIN") {
      router.replace("/admin");
    }
    if (resolved.kind === "active" && resolved.user.accountType === "WORKER") {
      router.replace("/work");
    }
    // Slide the 30-day expiry forward on every active visit so the session
    // only lapses after 30 days of the app not being opened at all.
    if (resolved.kind === "active") {
      void refreshSession();
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

  // BUSINESS_OWNER email verification and admin-approval gating is handled by
  // standalone pages (/verify-email, /pending-approval) that the login router
  // directs users to. Any BUSINESS_OWNER who reaches AuthProvider is fully
  // activated (email_verified=true, business_status='verified').

  return <CurrentUserContext.Provider value={resolved.user}>{children}</CurrentUserContext.Provider>;
}
