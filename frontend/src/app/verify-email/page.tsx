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

  useEffect(() => {
    if (!resolved) return;
    if (resolved.kind === "no-session" || resolved.kind === "expired") {
      router.replace("/login?force=true");
      return;
    }
    if (resolved.user.emailVerified) {
      router.replace("/dashboard");
    }
  }, [resolved, router]);

  if (!resolved || resolved.kind !== "active") {
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center p-6 bg-surface">
        <div className="w-full max-w-sm flex flex-col gap-4 items-center">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-14 w-full rounded-xl mt-4" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (resolved.user.emailVerified) {
    return null;
  }

  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center p-4 sm:p-6 bg-surface">
      <div className="w-full max-w-sm flex flex-col gap-6 items-center">
        <EmailVerificationCard
          userId={resolved.user.id}
          onSuccess={() => {
            router.replace("/dashboard");
          }}
        />

        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/login?force=true");
          }}
          className="text-[length:var(--font-size-body)] text-on-surface-muted hover:text-on-surface transition-colors py-2 min-h-[var(--touch-target-min)]"
        >
          Use a different account
        </button>
      </div>
    </main>
  );
}
