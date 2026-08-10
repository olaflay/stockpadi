"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import { resetPasswordAction } from "@/app/actions/auth";
import Link from "next/link";
import { useScrollToError } from "@/hooks/use-scroll-to-error";

export default function ResetPasswordForm({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const isOnline = useOnlineStatus();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  const errorRef = useScrollToError<HTMLDivElement>(error);

  async function handleSubmit() {
    setError(null);
    if (!isOnline) {
      setError("An internet connection is required to change your password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("password", password);
      formData.append("csrf_token", csrfToken);

      const result = await resetPasswordAction(formData);

      if (!result.success) {
        setError(result.error || "An error occurred.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Could not reset password. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto items-center justify-center text-center">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface mb-2">
          Password updated
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted mb-8">
          Your password has been changed successfully.
        </p>
        <Link
          href="/login"
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)] flex items-center justify-center no-underline"
        >
          Sign in
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
            Create new password
          </h1>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Enter a strong password that you haven&apos;t used before
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 pb-10 shrink-0">
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container/40 p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              New Password
            </span>
            <div className="relative">
              <TextInput
                id="reset-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="pr-12"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] -translate-y-1/2 items-center justify-center text-on-surface-muted hover:text-on-surface transition-colors duration-[var(--motion-duration-short)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>
          </label>
        </div>

        <RippleButton
          type="button"
          onClick={handleSubmit}
          disabled={busy || !password.trim()}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Updating…" : "Reset Password"}
        </RippleButton>
      </div>
    </div>
  );
}
