import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { RippleButton } from "@/components/ui/Ripple";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void; id?: string };
  /**
   * A real icon in a soft tonal container, following Samsung One UI & M3.
   */
  icon?: LucideIcon;
  /**
   * Hand-authored SVG illustration for key emotional moments.
   */
  illustration?: ComponentType<{ className?: string }>;
  /**
   * Legacy flag kept for backward compatibility; rendering now maintains
   * consistent close CTA spacing across all viewports.
   */
  fullScreen?: boolean;
  className?: string;
}

/** First-run guidance with a clear redirect action. Never a dead end. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  illustration: Illustration,
  fullScreen,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-1 w-full max-w-md mx-auto flex-col justify-between my-auto rounded-2xl depth-card bg-surface-container-low border border-border/60 p-6 sm:p-7 overflow-hidden animate-step-in select-none ${className ?? ""}`}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center py-2 sm:py-4">
        {Illustration ? (
          <Illustration className="mb-4 h-22 w-22 sm:h-24 sm:w-24 text-brand-accent shrink-0" />
        ) : (
          Icon && (
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent/10 text-brand-accent shrink-0 depth-bubble">
              <Icon size={28} className="text-brand-accent" aria-hidden />
            </div>
          )
        )}

        <p className="text-base sm:text-lg font-bold text-on-surface leading-snug">
          {title}
        </p>

        <p className="mt-2 max-w-xs text-xs sm:text-sm text-on-surface-muted leading-relaxed">
          {description}
        </p>
      </div>

      {action && (
        <div className="w-full pt-4 mt-auto">
          <RippleButton
            id={action.id}
            type="button"
            onClick={action.onClick}
            className="w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-brand-accent/50 bg-brand-accent/10 px-5 py-3 text-sm font-semibold text-brand-accent hover:bg-brand-accent/15 active:scale-[0.98] transition-all inline-flex items-center justify-center cursor-pointer shadow-xs"
          >
            {action.label}
          </RippleButton>
        </div>
      )}
    </div>
  );
}
