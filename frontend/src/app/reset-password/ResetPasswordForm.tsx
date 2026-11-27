"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";
import { RippleButton } from "@/components/ui/Ripple";
import { TextInput } from "@/components/ui/TextInput";
import Link from "next/link";
import { useScrollToError } from "@/hooks/use-scroll-to-error";
import { isPasswordPwned } from "@/lib/pwned-passwords";
import { PasswordGuidance } from "@/components/auth/PasswordGuidance";
import { meetsPasswordPolicy } from "@stockpadi/contracts";
import { BackendRequestError, serverPostAnonymous } from "@/platform/api/backend-client";
import { useAuthFieldVisibility } from "@/hooks/use-auth-field-visibility";

function subscribeToResetLink(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readResetToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token_hash") ?? "";
  return /^[a-z0-9_-]{32,128}$/i.test(token) ? token : "";
}

export default function ResetPasswordForm() {
  const isOnline = useOnlineStatus();
  const recoveryToken = useSyncExternalStore(subscribeToResetLink, readResetToken, () => null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const formRegionRef = useRef<HTMLDivElement>(null);
  useAuthFieldVisibility(formRegionRef, Boolean(recoveryToken && !linkError && !success));

  const errorRef = useScrollToError<HTMLDivElement>(error);

  async function handleSubmit() {
    if (!recoveryToken || busy) return;
    setError(null);
    if (!isOnline) {
      setError("An internet connection is required to change your password.");
      return;
    }

    if (!meetsPasswordPolicy(password)) {
      setError("Finish the password guidance before continuing.");
      return;
    }

    setBusy(true);
    try {
      if (await isPasswordPwned(password)) {
        setError("This password has appeared in a data breach. Please choose a different one.");
        return;
      }

      await serverPostAnonymous("/api/auth/password/recovery/complete", { tokenHash: recoveryToken, password });
      window.history.replaceState(null, "", window.location.pathname);
      setPassword("");
      setSuccess(true);
    } catch (cause) {
      if (cause instanceof BackendRequestError) {
        if (cause.code === "RESET_LINK_INVALID" || cause.code === "RESET_LINK_USED") {
          window.history.replaceState(null, "", window.location.pathname);
          setLinkError(cause.message);
        } else {
          setError(cause.message);
        }
      } else {
        setError("We couldn't update your password. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="auth-viewport flex w-full flex-col px-6 max-w-md mx-auto items-center justify-center text-center">
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

  if (recoveryToken === null) {
    return <p role="status" className="p-6 text-center text-on-surface-muted">Checking your reset link…</p>;
  }

  if (!recoveryToken || linkError) {
    return (
      <div className="auth-viewport flex w-full max-w-md flex-col items-center justify-center gap-4 px-6 mx-auto text-center">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
          Request a new reset link
        </h1>
        <p className="text-on-surface-muted">{linkError ?? "This reset link is missing, invalid, or expired."}</p>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-[var(--touch-target-min)] items-center rounded-[var(--radius-control)] bg-brand-accent px-5 font-bold text-brand-accent-contrast"
        >
          Send a new reset link
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-viewport flex w-full flex-col max-w-md mx-auto">
      <div className="flex shrink-0 flex-col items-center gap-1 px-6 py-8 text-center">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold tracking-tight text-on-surface">
          Create new password
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Choose a password you can remember and that is hard to guess
        </p>
      </div>

      <div ref={formRegionRef} data-auth-scroll-region className="auth-scroll-region px-6 pb-10">
      {error && (
        <div
          ref={errorRef}
          id="reset-password-error"
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
          <span>Password change needs a connection. Your work will stay here.</span>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col gap-4"
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
                enterKeyHint="done"
                aria-describedby="reset-password-guidance"
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
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
            <div id="reset-password-guidance">
              <PasswordGuidance password={password} active={passwordFocused} />
            </div>
          </label>
        </div>

        <RippleButton
          type="submit"
          disabled={busy}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-[var(--state-opacity-disabled-content)] hover:opacity-95 transition-opacity duration-[var(--motion-duration-short)] py-3 shadow-[var(--shadow-elevation-1)]"
        >
          {busy ? "Updating…" : "Reset Password"}
        </RippleButton>
      </form>
      </div>
    </div>
  );
}
