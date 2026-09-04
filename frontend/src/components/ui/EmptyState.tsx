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
      className={`flex h-full min-h-full w-full max-w-sm mx-auto flex-col animate-step-in ${
        fullScreen ? "" : "rounded-[var(--radius-focus-block)] bg-surface-container"
      } ${className ?? ""}`}
    >
      <div className="flex w-full flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8 text-center">
        {Illustration ? (
          <Illustration className="mb-4 h-24 w-24 text-brand-accent shrink-0" />
        ) : (
          Icon && (
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent/10 shrink-0">
              <Icon size={28} className="text-brand-accent" aria-hidden />
            </div>
          )
        )}

        <p className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface leading-snug">
          {title}
        </p>

        <p className="mt-1.5 max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
          {description}
        </p>
      </div>

      {action && (
        <div className="w-full px-6 pb-6 pt-2">
          <RippleButton
            id={action.id}
            type="button"
            onClick={action.onClick}
            className="w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-6 py-2.5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity inline-flex items-center justify-center"
          >
            {action.label}
          </RippleButton>
        </div>
      )}
    </div>
  );
}
