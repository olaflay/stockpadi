"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { RippleButton } from "@/components/ui/Ripple";
import { sendVerificationEmail, verifyEmailCode } from "@/features/auth/verification-client";

const RESEND_COOLDOWN_SECONDS = 60;
const CODE_LENGTH = 6;

interface EmailVerificationCardProps {
  userId: string;
  onSuccess?: () => void;
}

export function EmailVerificationCard({ userId, onSuccess }: EmailVerificationCardProps) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const executeVerify = useCallback(async (codeToVerify: string) => {
    if (!/^\d{6}$/.test(codeToVerify)) {
      setError("Enter the 6-digit code.");
      return;
    }
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
      setBusy(false);
    }
  }, [userId, onSuccess]);

  function handleInputChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const rawVal = e.target.value;
    const numericChars = rawVal.replace(/\D/g, "");

    if (!numericChars) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    if (numericChars.length > 1) {
      applyPastedCode(numericChars, index);
      return;
    }

    const next = [...digits];
    next[index] = numericChars[0];
    setDigits(next);
    setError(null);

    if (index < CODE_LENGTH - 1) {
      setActiveIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }

    const fullCode = next.join("");
    if (fullCode.length === CODE_LENGTH && !next.includes("")) {
      void executeVerify(fullCode);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index] !== "") {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      } else if (index > 0) {
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
        setActiveIndex(index - 1);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      setActiveIndex(index - 1);
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      setActiveIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === "Enter") {
      const code = digits.join("");
      if (code.length === CODE_LENGTH) {
        void executeVerify(code);
      }
    }
  }

  function applyPastedCode(pastedText: string, startIndex = 0) {
    const numeric = pastedText.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!numeric) return;

    const next = [...digits];
    for (let i = 0; i < numeric.length; i++) {
      const targetIndex = startIndex + i;
      if (targetIndex < CODE_LENGTH) {
        next[targetIndex] = numeric[i];
      }
    }
    setDigits(next);
    setError(null);

    const nextFocus = Math.min(startIndex + numeric.length, CODE_LENGTH - 1);
    setActiveIndex(nextFocus);
    inputRefs.current[nextFocus]?.focus();

    const fullCode = next.join("");
    if (fullCode.length === CODE_LENGTH && !next.includes("")) {
      void executeVerify(fullCode);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    applyPastedCode(pasted, 0);
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return;
    setError(null);
    setBusy(true);

    try {
      const result = await sendVerificationEmail();
      if (!result.ok) {
        setError(result.message ?? "Could not send code.");
        return;
      }
      startCooldown();
    } catch {
      setError("Could not send code. Check your internet.");
    } finally {
      setBusy(false);
    }
  }

  const isCodeComplete = digits.join("").length === CODE_LENGTH && !digits.includes("");

  return (
    <div
      role="region"
      aria-label="Email verification"
      className="w-full max-w-sm mx-auto"
      onPaste={handlePaste}
    >
      <div className="text-center mb-8">
        <h1 className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface mb-2">
          Verify your email
        </h1>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Enter the 6-digit code sent to your email.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 rounded-xl bg-danger-container px-4 py-3 text-[length:var(--font-size-body)] text-on-danger-container"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-center gap-2.5 mb-8">
        {digits.map((digit, idx) => {
          const isActive = activeIndex === idx;
          const hasValue = digit !== "";

          return (
            <input
              key={idx}
              ref={(el) => { inputRefs.current[idx] = el; }}
              id={`otp-digit-${idx}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              autoComplete={idx === 0 ? "one-time-code" : "off"}
              onChange={(e) => handleInputChange(idx, e)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              onFocus={() => setActiveIndex(idx)}
              onClick={() => setActiveIndex(idx)}
              disabled={busy}
              className={`w-11 h-14 sm:w-13 sm:h-16 rounded-xl text-center font-mono text-2xl font-bold transition-all duration-150 outline-none ${
                isActive
                  ? "!border-brand-accent bg-surface ring-2 ring-brand-accent/20 text-on-surface"
                  : hasValue
                  ? "border-brand-accent/40 bg-surface text-on-surface"
                  : "border-border bg-surface-container-low text-on-surface-muted"
              } ${error ? "!border-danger" : ""}`}
              style={{ borderWidth: "2px" }}
              aria-label={`Digit ${idx + 1} of verification code`}
            />
          );
        })}
      </div>

      <RippleButton
        type="button"
        id="btn-verify-otp"
        onClick={() => executeVerify(digits.join(""))}
        disabled={busy || !isCodeComplete}
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
