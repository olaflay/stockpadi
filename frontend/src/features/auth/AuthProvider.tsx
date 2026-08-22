"use client";

import { createContext, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { EmailVerificationBanner } from "@/features/auth/EmailVerificationBanner";
import { signOut } from "@/features/auth/logout";
import { removeLegacyTestUser } from "@/features/auth/legacy-cleanup";

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
  if (resolved.user.accountType === "BUSINESS_OWNER" && !resolved.user.emailVerified) {
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
