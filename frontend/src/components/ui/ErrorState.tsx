import { RippleButton } from "@/components/ui/Ripple";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

/** Plain language plus a retry action, never a raw error code or stack trace. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-danger-container bg-danger-container px-6 py-8 text-center animate-step-in">
      <p className="text-[length:var(--font-size-body-lg)] font-medium text-on-danger-container">{message}</p>
      <RippleButton
        type="button"
        onClick={onRetry}
        className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-on-danger-container px-5 text-[length:var(--font-size-body)] font-medium text-on-danger-container hover:bg-on-danger-container/10 transition-colors"
      >
        Try again
      </RippleButton>
    </div>
  );
}
