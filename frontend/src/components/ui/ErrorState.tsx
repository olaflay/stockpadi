import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry: () => void;
  className?: string;
}

/** Plain language plus a retry action and dashboard fallback. Never a dead end. */
export function ErrorState({ title = "Something went wrong", message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`flex h-full min-h-full w-full max-w-sm mx-auto flex-col rounded-[var(--radius-focus-block)] border border-danger/20 bg-danger/5 animate-step-in ${className ?? ""}`}
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-danger shrink-0">
          <AlertCircle size={28} aria-hidden />
        </div>

        <p className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface leading-snug">
          {title}
        </p>

        <p className="mt-1.5 max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
          {message}
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2 px-6 pb-6 pt-2">
        <RippleButton
          type="button"
          onClick={onRetry}
          className="w-full min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-danger px-5 py-2.5 text-[length:var(--font-size-body)] font-semibold text-white shadow-[var(--shadow-elevation-1)] hover:opacity-90 transition-opacity"
        >
          <RotateCcw size={16} aria-hidden />
          <span>Try again</span>
        </RippleButton>

        <Link
          href="/dashboard"
          className="min-h-[var(--touch-target-min)] inline-flex items-center justify-center text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
