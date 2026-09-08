"use client";

/**
 * Lead system: Samsung One UI (focus block, thumb-reach actions, high-contrast tokens).
 * Custom-crafted for StockPadi:
 *   - StockPadi Emerald (#0A6E4D) brand identity with high-contrast surfaces
 *   - Tactile 6-slot OTP interaction with active focus ring and caret
 *   - Auto-advance on digit input, backspace retreat, and arrow navigation
 *   - Universal clipboard paste support (Ctrl+V, mobile tap-paste)
 *   - RippleButton tap feedback per design-system.md
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Mail, RefreshCw, AlertCircle } from "lucide-react";
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

  // Resend cooldown timer
  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // References to the 6 input elements
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

  // Auto-focus first input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Verification submission
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

  // Handle single digit input or autofill
  function handleInputChange(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const rawVal = e.target.value;
    const numericChars = rawVal.replace(/\D/g, "");

    if (!numericChars) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    // Multiple digits entered (e.g. paste or autofill in one field)
    if (numericChars.length > 1) {
      applyPastedCode(numericChars, index);
      return;
    }

    // Single digit entry
    const next = [...digits];
    next[index] = numericChars[0];
    setDigits(next);
    setError(null);

    // Advance focus to next input
    if (index < CODE_LENGTH - 1) {
      setActiveIndex(index + 1);
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit on 6th digit completion
    const fullCode = next.join("");
    if (fullCode.length === CODE_LENGTH && !next.includes("")) {
      void executeVerify(fullCode);
    }
  }

  // Keyboard navigation & backspace management
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

  // Helper to distribute pasted digits into the boxes
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

    // Auto-verify if all 6 digits are provided
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

  // Resend verification code
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
      className="relative w-full max-w-[420px] rounded-[28px] sm:rounded-[32px] bg-surface p-7 sm:p-9 border border-brand-accent/15 shadow-[0_20px_50px_-15px_rgba(10,110,77,0.1),0_4px_16px_rgba(0,0,0,0.03)] mx-auto transition-all"
      onPaste={handlePaste}
    >
      {/* Top Squircle Badge */}
      <div className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-brand-accent/10 border border-brand-accent/20 text-brand-accent shadow-xs">
        <Mail className="h-6 w-6 stroke-[2.2]" aria-hidden="true" />
      </div>

      {/* Heading */}
      <h1 className="font-serif text-[26px] sm:text-[30px] font-bold text-on-surface text-center tracking-tight leading-tight mb-2">
        Verify your email
      </h1>

      {/* Subtitle */}
      <p className="text-[14px] sm:text-[15px] text-on-surface-muted text-center leading-relaxed mb-7 max-w-[280px] mx-auto">
        We sent a 6-digit code to your email.
      </p>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-xl bg-danger-container border border-danger/20 px-3.5 py-2.5 text-[length:var(--font-size-body)] text-on-danger-container font-medium"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
          <span className="flex-1 text-left">{error}</span>
        </div>
      )}

      {/* 6 Tactile Input Boxes */}
      <div className="flex items-center justify-center gap-2 sm:gap-2.5 mb-7">
        {digits.map((digit, idx) => {
          const isActive = activeIndex === idx;
          const hasValue = digit !== "";

          return (
            <input
              key={idx}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
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
              className={`w-11 h-14 sm:w-13 sm:h-16 rounded-xl sm:rounded-2xl border-2 text-center font-mono text-2xl sm:text-[28px] font-bold transition-all duration-150 outline-none select-all ${
                isActive
                  ? "!border-brand-accent !bg-surface ring-4 ring-brand-accent/15 shadow-xs text-on-surface"
                  : hasValue
                  ? "border-brand-accent/40 bg-surface text-on-surface"
                  : "border-border/80 bg-surface-container-low/60 text-on-surface-muted"
              } ${error ? "!border-danger !ring-danger/20" : ""}`}
              aria-label={`Digit ${idx + 1} of verification code`}
            />
          );
        })}
      </div>

      {/* Verify Button */}
      <RippleButton
        type="button"
        id="btn-verify-otp"
        onClick={() => executeVerify(digits.join(""))}
        disabled={busy || !isCodeComplete}
        className="w-full h-12 sm:h-13 rounded-xl sm:rounded-2xl bg-brand-accent text-brand-accent-contrast font-semibold text-[15px] sm:text-base hover:opacity-95 active:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-[0_8px_20px_-4px_rgba(10,110,77,0.3)] flex items-center justify-center gap-2 cursor-pointer"
      >
        {busy ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Checking...</span>
          </>
        ) : (
          <span>Continue</span>
        )}
      </RippleButton>

      {/* Resend Link with Cooldown */}
      <div className="mt-6 text-center text-[13px] sm:text-[14px] text-on-surface-muted">
        Didn&apos;t get the code?{" "}
        {cooldown > 0 ? (
          <span className="font-semibold text-on-surface-muted/60">
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
