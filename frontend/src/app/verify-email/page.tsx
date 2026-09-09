"use client";

/**
 * /verify-email — Email verification of an approved account.
 *
 * Reached AFTER the admin approves the account (business_status='verified'),
 * when the email is not yet verified. The verification code email is dispatched
 * by the admin approval action server-side, so this page does NOT auto-send
 * anything on mount — the code is already in the owner's inbox. A manual
 * "Send again" inside the OTP card is available if it was lost.
 *
 * Guard logic:
 *   - No local session → redirect to /login
 *   - Session + emailVerified=true + businessStatus='verified' → /dashboard
 *   - Session + emailVerified=true + not verified → /pending-approval
 *   - Otherwise: show the OTP card to complete verification.
 *
 * On successful verification: IndexedDB is updated (emailVerified=true) and
 * the page routes forward based on business status.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { EmailVerificationCard } from "@/features/auth/EmailVerificationCard";
import { signOut } from "@/features/auth/logout";
import { Skeleton } from "@/components/ui/Skeleton";
import { CheckCircle2 } from "lucide-react";

export default function VerifyEmailPage() {
  const router = useRouter();

  const resolved = useLiveQuery(async () => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    if (!session) return { kind: "no-session" as const };
    if (new Date(session.expiresAt).getTime() < Date.now()) return { kind: "expired" as const };
    const user = await db.localUsers.get(session.userId);
    if (!user) return { kind: "no-session" as const };
    return { kind: "active" as const, user };
  }, []);

  // Routing guards
  useEffect(() => {
    if (!resolved) return;
    if (resolved.kind === "no-session" || resolved.kind === "expired") {
      router.replace("/login?force=true");
      return;
    }
    // Already verified — move to the next gate (or in if the account is approved)
    if (resolved.user.emailVerified) {
      router.replace(resolved.user.businessStatus === "verified" ? "/dashboard" : "/pending-approval");
    }
  }, [resolved, router]);

  if (!resolved || resolved.kind !== "active") {
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center p-6 bg-gradient-to-b from-[#f4f9f6] via-[#edf5f0] to-[#e4eee7]">
        <div className="w-full max-w-[420px] rounded-[28px] sm:rounded-[32px] bg-surface p-8 sm:p-10 shadow-sm border border-brand-accent/15 flex flex-col gap-4">
          <Skeleton className="h-13 w-13 rounded-2xl mx-auto" />
          <Skeleton className="h-7 w-48 mx-auto" />
          <Skeleton className="h-4 w-60 mx-auto" />
          <Skeleton className="h-14 w-full rounded-2xl mt-4" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (resolved.user.emailVerified) {
    // Will redirect via useEffect above — show nothing to avoid flash
    return null;
  }

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-[#f4f9f6] via-[#edf5f0] to-[#e4eee7] relative overflow-hidden">
      <div className="w-full max-w-[420px] flex flex-col gap-5 relative z-10">
        {/* Onboarding step indicator — approval precedes email verification */}
        <nav aria-label="Onboarding Progress" className="flex items-center justify-between px-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
          <div className="flex items-center gap-1.5 opacity-60">
            <span className="h-5 w-5 rounded-full border border-border bg-surface flex items-center justify-center text-[10px] font-bold">
              <CheckCircle2 className="h-3 w-3 text-brand-accent" />
            </span>
            <span>Account</span>
          </div>
          <div className="h-px flex-1 bg-border mx-2" />
          <div className="flex items-center gap-1.5 opacity-60">
            <span className="h-5 w-5 rounded-full border border-border bg-surface flex items-center justify-center text-[10px] font-bold">
              <CheckCircle2 className="h-3 w-3 text-brand-accent" />
            </span>
            <span>Approval</span>
          </div>
          <div className="h-px flex-1 bg-border mx-2" />
          <div className="flex items-center gap-1.5 text-brand-accent">
            <span className="h-5 w-5 rounded-full bg-brand-accent flex items-center justify-center text-brand-accent-contrast text-[10px] font-bold shadow-xs">3</span>
            <span className="font-semibold">Email</span>
          </div>
          <div className="h-px flex-1 bg-border mx-2" />
          <div className="flex items-center gap-1.5 opacity-50">
            <span className="h-5 w-5 rounded-full border border-border bg-surface flex items-center justify-center text-[10px] font-bold">4</span>
            <span>Start</span>
          </div>
        </nav>

        {/* Verification Card */}
        <EmailVerificationCard
          userId={resolved.user.id}
          onSuccess={() => {
            router.replace(resolved.user.businessStatus === "verified" ? "/dashboard" : "/pending-approval");
          }}
        />

        {/* Switch account link */}
        <div className="text-center">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login?force=true");
            }}
            className="text-[length:var(--font-size-body)] font-medium text-on-surface-muted hover:text-on-surface transition-colors py-2 px-3 focus:outline-none min-h-[var(--touch-target-min)] cursor-pointer"
          >
            Use a different account
          </button>
        </div>
      </div>
    </main>
  );
}
