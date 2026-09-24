"use client";

import { useState } from "react";
import { Eye, EyeOff, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import Link from "next/link";
import { useScrollToError } from "@/hooks/use-scroll-to-error";
import { isPasswordPwned } from "@/lib/pwned-passwords";
import { getSupabase } from "@/lib/supabase";
import { PasswordGuidance } from "@/components/auth/PasswordGuidance";
import { meetsPasswordPolicy } from "@stockpadi/contracts";
import { serverPost } from "@/features/operations/server-client";

export default function ResetPasswordForm() {
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

    if (!meetsPasswordPolicy(password)) {
      setError("Use every password requirement shown below.");
      return;
    }

    setBusy(true);
    try {
      if (await isPasswordPwned(password)) {
        setError("This password has appeared in a data breach. Please choose a different one.");
        setBusy(false);
        return;
      }

      // The reset link establishes a short-lived Supabase recovery session.
      // Its token authenticates the request; the backend then applies the same
      // shared password policy used at registration, with no business lookup.
      const supabase = getSupabase();
      if (!supabase) throw new Error("Password reset is not configured.");
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("This reset link has expired or has already been used. Request a new one.");
      }
      await serverPost("/api/auth/password/update", { password });

      setSuccess(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset password. Check your connection.");
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
    <div className="flex min-h-[100dvh] w-full flex-col px-6 max-w-md mx-auto overflow-y-auto">
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-4 pb-10 shrink-0"
      >
        <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface-container-low p-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--font-size-label)] font-semibold text-on-surface-muted">
              New Password
            </span>
            <div className="relative">
              <TextInput
                id="reset-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
            <PasswordGuidance password={password} />
          </label>
        </div>

        <RippleButton
          type="submit"
          disabled={busy || !meetsPasswordPolicy(password)}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Updating…" : "Reset Password"}
        </RippleButton>
      </form>
    </div>
  );
}
