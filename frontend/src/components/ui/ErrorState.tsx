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
      className={`flex flex-1 w-full max-w-md mx-auto flex-col justify-between my-auto rounded-2xl depth-card border-danger/30 bg-danger/[0.04] p-6 sm:p-7 overflow-hidden animate-step-in select-none ${className ?? ""}`}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center py-2 sm:py-4">
        <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger shrink-0 depth-bubble">
          <AlertCircle size={26} aria-hidden />
        </div>

        <p className="text-base sm:text-lg font-bold text-on-surface leading-snug">
          {title}
        </p>

        <p className="mt-2 max-w-xs text-xs sm:text-sm text-on-surface-muted leading-relaxed">
          {message}
        </p>
      </div>

      <div className="flex w-full flex-col items-center gap-2 pt-4 mt-auto">
        <RippleButton
          type="button"
          onClick={onRetry}
          className="w-full min-h-[var(--touch-target-min)] flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-danger px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-elevation-1)] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
        >
          <RotateCcw size={15} aria-hidden />
          <span>Try again</span>
        </RippleButton>

        <Link
          href="/dashboard"
          className="min-h-[var(--touch-target-min)] inline-flex items-center justify-center text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
