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
   * Full-screen layout with button pinned to bottom thumb zone for mobile.
   */
  fullScreen?: boolean;
}

/** First-run guidance with a clear redirect action. Never a dead end. */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  illustration: Illustration,
  fullScreen,
}: EmptyStateProps) {
  if (fullScreen) {
    return (
      <div className="flex h-full flex-1 flex-col justify-between">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center animate-step-in max-w-sm mx-auto">
          {Illustration ? (
            <Illustration className="mb-2 h-24 w-24 text-brand-accent" />
          ) : (
            Icon && (
              <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-brand-accent/10">
                <Icon size={30} className="text-brand-accent" aria-hidden />
              </div>
            )
          )}
          <p className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface">{title}</p>
          <p className="max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
            {description}
          </p>
        </div>
        {action && (
          <div className="border-t border-border px-6 py-4 shrink-0 pb-10 max-w-md mx-auto w-full">
            <RippleButton
              id={action.id}
              type="button"
              onClick={action.onClick}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity"
            >
              {action.label}
            </RippleButton>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-focus-block)] bg-surface-container px-6 py-12 text-center animate-step-in w-full max-w-sm mx-auto">
      {Illustration ? (
        <Illustration className="mb-1 h-20 w-20 text-brand-accent" />
      ) : (
        Icon && (
          <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent/10">
            <Icon size={26} className="text-brand-accent" aria-hidden />
          </div>
        )
      )}
      <p className="text-[length:var(--font-size-title)] font-semibold text-on-surface">{title}</p>
      <p className="max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
        {description}
      </p>
      {action && (
        <RippleButton
          id={action.id}
          type="button"
          onClick={action.onClick}
          className="mt-3 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-6 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] hover:opacity-95 transition-opacity"
        >
          {action.label}
        </RippleButton>
      )}
    </div>
  );
}
