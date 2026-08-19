"use client";

/**
 * Lead system: Samsung One UI — non-blocking, persistent inline banner.
 * This banner never uses a modal. It sits above dashboard content and
 * disappears as soon as email_verified flips to true in IndexedDB (live query).
 *
 * States:
 *   default   — "Check your email for a 6-digit code" + code input + Verify + Resend
 *   loading   — input/button disabled, "Verifying…" label
 *   resending — Resend link disabled, countdown timer (60s)
 *   error     — inline error in danger-container, never a modal
 *   success   — banner disappears (useLiveQuery removes it when emailVerified = true)
 *
 * Resend rate: mirrors the server-side 60-second rate limit. The client-side
 * countdown is purely UX — the server enforces the actual limit.
 *
 * See supabase/functions/send-verification/index.ts and
 * supabase/functions/verify-email/index.ts.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mail, RefreshCw, CheckCircle2, X } from "lucide-react";
import { db } from "@/lib/db";
import { RippleButton } from "@/components/ui/Ripple";
import { sendVerificationEmail, verifyEmailCode } from "@/features/auth/verification-client";

const RESEND_COOLDOWN_SECONDS = 60;

interface EmailVerificationBannerProps {
  userId: string;
}

export function EmailVerificationBanner({ userId }: EmailVerificationBannerProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Resend cooldown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    cooldownRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  if (dismissed) return null;

  async function handleVerify() {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await verifyEmailCode(code);
      if (!result.ok) {
        setError(result.message ?? "That code did not work.");
        setCode("");
        return;
      }
      // Update IndexedDB — the live query in the dashboard will re-render
      // and hide this banner without needing a page reload.
      await db.localUsers.update(userId, {
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      });
      // Banner disappears because the parent reads emailVerified from useLiveQuery.
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setError(null);
    setBusy(true);
    try {
      const result = await sendVerificationEmail();
      if (!result.ok) {
        setError(result.message ?? "Could not resend.");
        return;
      }
      startCooldown();
    } catch {
      setError("Could not resend. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius-card)] border border-brand-accent/20 bg-brand-accent/5 p-4 flex flex-col gap-3"
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] bg-brand-accent/10 text-brand-accent">
          <Mail size={18} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[length:var(--font-size-body-lg)] text-on-surface leading-snug">
            Verify your email address
          </p>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted mt-0.5">
            Check your inbox for a 6-digit code and enter it below.
          </p>
        </div>
        {/* Dismiss — banner is persistent but can be temporarily hidden */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex shrink-0 min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center text-on-surface-muted hover:text-on-surface transition-colors duration-[var(--motion-duration-short)] -mr-2 -my-2"
          aria-label="Dismiss for now"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-card)] bg-danger-container px-3 py-2 text-[length:var(--font-size-body)] text-on-danger-container font-medium"
        >
          {error}
        </div>
      )}

      {/* Code input + verify button */}
      <div className="flex gap-2 w-full">
        <input
          id="email-verify-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          className="min-h-[var(--touch-target-min)] flex-1 min-w-0 w-full rounded-[var(--radius-control)] border border-border bg-surface px-2 sm:px-4 text-center text-[length:var(--font-size-title)] tracking-[0.2em] sm:tracking-[0.4em] font-bold text-on-surface focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 outline-none transition-colors duration-[var(--motion-duration-short)]"
          inputMode="numeric"
          maxLength={6}
          placeholder="······"
          disabled={busy}
          aria-label="6-digit verification code"
        />
        <RippleButton
          type="button"
          id="email-verify-submit"
          onClick={handleVerify}
          disabled={busy || code.length !== 6}
          className="min-h-[var(--touch-target-min)] px-4 sm:px-5 rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] shrink-0 flex items-center gap-2"
        >
          {busy ? (
            <RefreshCw size={16} className="animate-spin" aria-hidden />
          ) : (
            <CheckCircle2 size={16} aria-hidden />
          )}
          {busy ? "Verifying" : "Verify"}
        </RippleButton>
      </div>

      {/* Resend link with cooldown */}
      <div className="flex items-center gap-1">
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          Did not get it?
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={busy || cooldown > 0}
          className="text-[length:var(--font-size-caption)] text-brand-accent font-semibold hover:underline disabled:opacity-[var(--state-opacity-disabled-content)] disabled:no-underline transition-opacity duration-[var(--motion-duration-short)]"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
