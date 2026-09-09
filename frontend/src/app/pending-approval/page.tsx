"use client";

/**
 * /pending-approval — Pending admin review lobby.
 *
 * Shown when the account is in EMAIL_VERIFIED_PENDING_ADMIN state.
 * NOT wrapped in AuthProvider — operates outside the authenticated app shell.
 *
 * Guard logic:
 *   - No local session → redirect to /login
 *   - emailVerified=false in IndexedDB → redirect to /verify-email
 *   - businessStatus='verified' in IndexedDB → redirect to /business
 *
 * Polling: every 60 seconds, calls account-context backend to detect approval.
 * When approved (businessStatus flips to 'verified'), writes the update to
 * IndexedDB and redirects to /business. The user does not need to do anything.
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

  // Poll the backend for status change and update IndexedDB on approval
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

      if (context.accountState === "FULLY_ACTIVATED" || context.businessStatus === "verified") {
        // Approved! Update IndexedDB and redirect.
        await db.localUsers.update(context.profile.id, {
          businessStatus: "verified",
          emailVerified: context.profile.email_verified ?? true,
          updatedAt: new Date().toISOString(),
        });
        if (context.businessId) {
          await db.businessProfile.update(BUSINESS_PROFILE_SINGLETON_ID, { businessId: context.businessId });
          await setLocalBusinessId(context.businessId);
        }
        router.replace("/business");
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
    if (!user.emailVerified) {
      router.replace("/verify-email");
      return;
    }
    // Already approved (e.g., navigated back from /business) — redirect forward
    if (user.businessStatus === "verified") {
      router.replace("/business");
      return;
    }
  }, [resolved, router]);

  // Start polling when the page mounts and the user is properly in pending state
  useEffect(() => {
    if (!resolved || resolved.kind !== "active") return;
    if (!resolved.user.emailVerified || resolved.user.businessStatus === "verified") return;

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

        {/* Progress indicator */}
        <div className="flex items-center gap-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
          <div className="flex items-center gap-1.5 opacity-50">
            <span className="h-5 w-5 rounded-full bg-brand-accent flex items-center justify-center text-brand-accent-contrast text-[10px]">
              <CheckCircle2 className="h-3 w-3" />
            </span>
            <span className="line-through">Verify email</span>
          </div>
          <div className="h-px flex-1 bg-brand-accent/40" />
          <div className="flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full bg-brand-accent flex items-center justify-center text-brand-accent-contrast text-[10px] font-bold">2</span>
            <span className="font-semibold text-brand-accent">Admin approval</span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className="flex items-center gap-1.5 opacity-40">
            <span className="h-5 w-5 rounded-full border border-border flex items-center justify-center text-[10px] font-bold">3</span>
            <span>Access app</span>
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
              Your email is verified. We are reviewing your store profile.
              You will get an email once approved. This usually takes under 24 hours.
            </p>
          </div>

          {/* Checklist */}
          <div className="w-full flex flex-col gap-2 text-left mt-1">
            <div className="flex items-center gap-2 text-[length:var(--font-size-body)]">
              <CheckCircle2 size={16} className="text-success shrink-0" aria-hidden />
              <span className="text-on-surface">Email address verified</span>
            </div>
            <div className="flex items-center gap-2 text-[length:var(--font-size-body)]">
              <RefreshCw size={16} className="text-warning shrink-0 animate-spin" style={{ animationDuration: "3s" }} aria-hidden />
              <span className="text-on-surface-muted">Waiting for admin approval…</span>
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
