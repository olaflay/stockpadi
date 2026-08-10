"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import { forgotPasswordAction } from "@/app/actions/auth";
import Link from "next/link";
import { useScrollToError } from "@/hooks/use-scroll-to-error";

export default function ForgotPasswordForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const errorRef = useScrollToError<HTMLDivElement>(error);

  async function handleSubmit() {
    setError(null);
    if (!isOnline) {
      setError("An internet connection is required to reset your password.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("csrf_token", csrfToken);

      const result = await forgotPasswordAction(formData);

      if (!result.success) {
        setError(result.error || "An error occurred.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Could not request a password reset. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto items-center justify-center text-center">
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
    <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto overflow-y-auto">
      {error && (
        <div
          ref={errorRef}
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
          <span>No connection. Password reset requires internet.</span>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
            Reset password
          </h1>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Enter your email to receive a reset link
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 pb-10 shrink-0">
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              Email address
            </span>
            <TextInput
              id="reset-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@domain.com"
              autoComplete="email"
              autoCapitalize="none"
              inputMode="email"
            />
          </label>
        </div>

        <RippleButton
          type="button"
          onClick={handleSubmit}
          disabled={busy || !email.trim()}
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
      </div>
    </div>
  );
}
