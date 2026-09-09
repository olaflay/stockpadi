"use client";

/**
 * /pending-approval — Pending admin review lobby.
 *
 * Shown when the business is awaiting admin approval (accountState
 * PENDING_ADMIN_APPROVAL or legacy EMAIL_VERIFIED_PENDING_ADMIN).
 * NOT wrapped in AuthProvider — operates outside the authenticated app shell.
 *
 * Under the current flow NO verification email is sent at registration. The
 * admin approves (business_status='verified') and the backend dispatches the
 * verification code email server-side. So this page's job is purely to wait:
 *
 * Guard logic:
 *   - No local session → redirect to /login
 *   - businessStatus='verified' + emailVerified=true → redirect to /dashboard
 *   - businessStatus='verified' + emailVerified=false → redirect to /verify-email
 *   - Otherwise (business still pending) → stay here and poll
 *
 * Polling: every 60 seconds, calls account-context backend to detect approval.
 * When approved (businessStatus flips to 'verified'):
 *   - if the email is already verified → go straight to /dashboard
 *   - otherwise → the code email is in the owner's inbox; go to /verify-email
 */

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, Clock, Mail, RefreshCw } from "lucide-react";
import { db, SESSION_SINGLETON_ID } from "@/lib/db";
import { RippleButton } from "@/components/ui/Ripple";
import { signOut } from "@/features/auth/logout";
import { callBackend, BackendError } from "@/features/auth/backend-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { setLocalBusinessId } from "@/lib/local-tenant";
import { BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";

const POLL_INTERVAL_MS = 60_000;

export default function PendingApprovalPage() {
  const router = useRouter();
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolved = useLiveQuery(async () => {
    const session = await db.session.get(SESSION_SINGLETON_ID);
    if (!session) return { kind: "no-session" as const };
    if (new Date(session.expiresAt).getTime() < Date.now()) return { kind: "expired" as const };
    const user = await db.localUsers.get(session.userId);
    if (!user) return { kind: "no-session" as const };
    return { kind: "active" as const, user };
  }, []);

  // Poll the backend for status change and update IndexedDB on approval.
  // The approval action sends the verification code email on the backend, so
  // once businessStatus flips to 'verified' the user is routed to /verify-email
  // (or straight to /dashboard if the email was already verified, e.g. legacy).
  const checkApprovalStatus = useCallback(async () => {
    try {
      const context = await callBackend<{
        accountType: string;
        accountState?: string;
        businessId?: string;
        businessStatus?: string;
        profile: { id: string; full_name: string; email_verified?: boolean; is_active: boolean };
        permissions: string[];
        branchIds?: string[];
      }>("account-context", {});

      if (context.businessStatus === "verified") {
        const emailVerified = context.profile.email_verified === true;
        // Approved! Update IndexedDB and move forward based on email status.
        await db.localUsers.update(context.profile.id, {
          businessStatus: "verified",
          emailVerified,
          updatedAt: new Date().toISOString(),
        });
        if (context.businessId) {
          await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { businessId: context.businessId });
          await setLocalBusinessId(context.businessId);
        }
        router.replace(emailVerified ? "/dashboard" : "/verify-email");
        return;
      }
    } catch (error) {
      if (error instanceof BackendError && (error.code === "ACCOUNT_SUSPENDED" || error.code === "ACCOUNT_REJECTED")) {
        // Sign out and show them the login page with the error
        await signOut();
        router.replace(`/login?error=${error.code.toLowerCase()}`);
      }
      // Other errors (network, etc.) — silently ignore, will retry on next poll
    }
  }, [router]);

  // Routing guards
  useEffect(() => {
    if (!resolved) return;
    if (resolved.kind === "no-session" || resolved.kind === "expired") {
      router.replace("/login?force=true");
      return;
    }
    const { user } = resolved;
    // Already approved — move forward based on email status.
    // The approval flow itself sends the verification code email, so an
    // unverified email now means "go verify code from your inbox", not
    // "go back to email verification before approval".
    if (user.businessStatus === "verified") {
      router.replace(user.emailVerified ? "/dashboard" : "/verify-email");
      return;
    }
    // Still pending — stay on this page regardless of email-status.
  }, [resolved, router]);

  // Start polling when the page mounts and the business is still pending
  useEffect(() => {
    if (!resolved || resolved.kind !== "active") return;
    if (resolved.user.businessStatus === "verified") return;

    // First check immediately (without delay) then on interval
    void checkApprovalStatus();

    pollTimerRef.current = setInterval(() => {
      void checkApprovalStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [resolved, checkApprovalStatus]);

  if (!resolved || resolved.kind !== "active") {
    return (
      <div className="flex min-h-dvh w-full flex-col items-center justify-center p-6">
        <div className="w-full max-w-md flex flex-col gap-3">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-6 w-48 mx-auto" />
          <Skeleton className="h-4 w-64 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh w-full flex-col items-center justify-center p-6 bg-surface-container/20">
      <div className="w-full max-w-md flex flex-col gap-6">

        {/* Progress indicator — approval precedes email verification */}
        <div className="flex items-center gap-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
          <div className="flex items-center gap-1.5 opacity-50">
            <span className="h-5 w-5 rounded-full bg-brand-accent flex items-center justify-center text-brand-accent-contrast text-[10px]">
              <CheckCircle2 className="h-3 w-3" />
            </span>
            <span className="line-through">Account</span>
          </div>
          <div className="h-px flex-1 bg-brand-accent/40" />
          <div className="flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full bg-brand-accent flex items-center justify-center text-brand-accent-contrast text-[10px] font-bold">2</span>
            <span className="font-semibold text-brand-accent">Admin approval</span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className="flex items-center gap-1.5 opacity-40">
            <span className="h-5 w-5 rounded-full border border-border flex items-center justify-center text-[10px] font-bold">3</span>
            <span>Email</span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className="flex items-center gap-1.5 opacity-40">
            <span className="h-5 w-5 rounded-full border border-border flex items-center justify-center text-[10px] font-bold">4</span>
            <span>Start</span>
          </div>
        </div>

        {/* Main card */}
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 flex flex-col items-center gap-4 text-center shadow-[var(--shadow-elevation-1)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-warning-container text-on-warning-container">
            <Clock size={28} aria-hidden />
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
              Under Review
            </h1>
            <p className="text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
              We are reviewing your store profile. Once approved we will email
              you a verification code. This usually takes under 24 hours.
            </p>
          </div>

          {/* Checklist */}
          <div className="w-full flex flex-col gap-2 text-left mt-1">
            <div className="flex items-center gap-2 text-[length:var(--font-size-body)]">
              <CheckCircle2 size={16} className="text-success shrink-0" aria-hidden />
              <span className="text-on-surface">Account created</span>
            </div>
            <div className="flex items-center gap-2 text-[length:var(--font-size-body)]">
              <RefreshCw size={16} className="text-warning shrink-0 animate-spin" style={{ animationDuration: "3s" }} aria-hidden />
              <span className="text-on-surface-muted">Waiting for admin approval…</span>
            </div>
            <div className="flex items-center gap-2 text-[length:var(--font-size-body)]">
              <span className="h-4 w-4 rounded-full border border-border flex items-center justify-center text-[10px] font-bold text-on-surface-muted" aria-hidden>3</span>
              <span className="text-on-surface-muted">Email you a verification code</span>
            </div>
          </div>

          {/* Contact */}
          <div className="w-full rounded-[var(--radius-card)] bg-surface-container/60 px-4 py-3 flex items-start gap-3 text-left">
            <Mail size={16} className="text-brand-accent shrink-0 mt-0.5" aria-hidden />
            <p className="text-[length:var(--font-size-body)] text-on-surface-muted leading-snug">
              Need help? Email{" "}
              <a
                href="mailto:support@stockpadi.com"
                className="text-brand-accent font-semibold hover:underline"
              >
                support@stockpadi.com
              </a>
            </p>
          </div>

          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            This page checks for approval automatically every minute.
          </p>
        </div>

        <div className="text-center">
          <RippleButton
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/login?force=true");
            }}
            className="text-[length:var(--font-size-body)] font-semibold text-brand-accent hover:underline min-h-[var(--touch-target-min)] px-2"
          >
            Sign out / Switch account
          </RippleButton>
        </div>
      </div>
    </div>
  );
}