"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { TextInput } from "@/components/ui/TextInput";
import { RippleButton } from "@/components/ui/Ripple";
import { sendVerificationEmail, verifyEmailCode } from "@/features/auth/verification-client";

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

interface EmailVerificationCardProps {
  userId: string;
  onSuccess?: () => void;
}

export function EmailVerificationCard({ userId, onSuccess }: EmailVerificationCardProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestInFlight = useRef(false);

  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
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

  const executeVerify = useCallback(async (codeToVerify: string) => {
    if (!/^\d{6}$/.test(codeToVerify)) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setError(null);
    setBusy(true);

    try {
      const result = await verifyEmailCode(codeToVerify);
      if (!result.ok) {
        if (result.message === "Email is already verified") {
          await db.localUsers.update(userId, {
            emailVerified: true,
            updatedAt: new Date().toISOString(),
          });
          onSuccess?.();
          return;
        }
        setError(result.message ?? "Wrong code or expired.");
        return;
      }

      await db.localUsers.update(userId, {
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      });
      onSuccess?.();
    } catch {
      setError("Check your internet and try again.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }, [userId, onSuccess]);

  function updateCode(value: string) {
    if (requestInFlight.current) return;
    const next = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (next === code) return;
    setCode(next);
    setError(null);
    if (next.length === CODE_LENGTH) void executeVerify(next);
  }

  async function handleResend() {
    if (cooldown > 0 || requestInFlight.current) return;
    requestInFlight.current = true;
    setError(null);
    setBusy(true);

    try {
      const result = await sendVerificationEmail();
      if (!result.ok) {
        setError(result.message ?? "Could not send code.");
        return;
      }
      setCode("");
      startCooldown();
    } catch {
      setError("Could not send code. Check your internet.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Email verification"
      className="w-full max-w-sm mx-auto"
    >
      <div className="text-center mb-8">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface mb-2">
          Verify your email
        </h1>
        <p id="otp-instructions" className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Enter or paste the 6-digit code from your email.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          id="otp-verification-error"
          className="mb-6 flex items-center gap-2 rounded-xl bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={(event) => {
        event.preventDefault();
        if (code.length === CODE_LENGTH) void executeVerify(code);
      }}>
        <TextInput
          id="otp-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="6-digit verification code"
          aria-describedby="otp-instructions"
          hasError={Boolean(error)}
          errorId="otp-verification-error"
          value={code}
          onChange={(event) => updateCode(event.currentTarget.value)}
          onPaste={(event) => {
            const pastedCode = event.clipboardData.getData("text").trim();
            if (/^\d(?:[\s-]*\d){5}$/.test(pastedCode)) {
              event.preventDefault();
              updateCode(pastedCode);
            }
          }}
          className="mb-6 h-14 text-center font-mono !text-2xl font-bold tracking-[0.35em]"
        />

        <RippleButton
          type="submit"
          id="btn-verify-otp"
          disabled={busy || code.length !== CODE_LENGTH}
          className="w-full h-12 rounded-xl bg-brand-accent text-brand-accent-contrast font-semibold text-[length:var(--font-size-body)] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2"
        >
          {busy ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Checking...</span>
            </>
          ) : (
            <span>Verify</span>
          )}
        </RippleButton>
      </form>

      <div className="mt-6 text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
        Didn&apos;t get the code?{" "}
        {cooldown > 0 ? (
          <span className="text-on-surface-muted/60">
            Wait {cooldown}s
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={busy}
            className="font-semibold text-brand-accent hover:underline focus:outline-none min-h-[var(--touch-target-min)]"
          >
            Send again
          </button>
        )}
      </div>
    </div>
  );
}
