"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import { getSupabase } from "@/lib/supabase";
import Link from "next/link";
import { useScrollToError } from "@/hooks/use-scroll-to-error";
import { useAuthFieldVisibility } from "@/hooks/use-auth-field-visibility";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const errorRef = useScrollToError<HTMLDivElement>(error);
  const formRegionRef = useRef<HTMLDivElement>(null);
  useAuthFieldVisibility(formRegionRef);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (!isOnline) {
      setError("An internet connection is required to reset your password.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (resetError) throw resetError;

      setSuccess(true);
    } catch {
      setError("Could not request a password reset. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="auth-viewport flex w-full flex-col px-6 max-w-md mx-auto items-center justify-center text-center">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface mb-2">
          Check your email
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted mb-8">
          If an account exists for that email, we&apos;ve sent a password reset link.
        </p>
        <Link
          href="/login"
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)] flex items-center justify-center no-underline"
        >
          Return to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-viewport flex w-full flex-col max-w-md mx-auto">
      <div className="flex shrink-0 flex-col items-center gap-1 px-6 py-8 text-center">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
          Reset password
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Enter your email to receive a reset link
        </p>
      </div>

      <div ref={formRegionRef} data-auth-scroll-region className="auth-scroll-region px-6 pb-10">
      {error && (
        <div
          ref={errorRef}
          id="forgot-password-error"
          role="alert"
          className="rounded-[var(--radius-card)] bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container font-medium mt-4 text-center shadow-[var(--shadow-elevation-1)] mx-auto w-full max-w-xs"
        >
          {error}
        </div>
      )}

      {!isOnline && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[var(--radius-card)] bg-warning-container px-4 py-3 text-[length:var(--font-size-body)] text-on-warning-container mt-4 shrink-0"
        >
          <WifiOff size={16} aria-hidden />
          <span>Password reset needs a connection. Your email will stay here.</span>
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface-container-low p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Email address
            </span>
            <TextInput
              id="reset-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="johnsonaimus@gmail.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
              enterKeyHint="done"
              aria-describedby={error ? "forgot-password-error" : undefined}
            />
          </label>
        </div>

        <RippleButton
          type="submit"
          disabled={busy}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Sending…" : "Send reset link"}
        </RippleButton>

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="flex items-center justify-center gap-2 text-center text-[length:var(--font-size-body)] text-on-surface-muted hover:text-on-surface hover:underline py-4 transition-colors duration-[var(--motion-duration-short)]"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to sign in
        </button>
      </form>
      </div>
    </div>
  );
}
