import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import { RippleButton } from "@/components/ui/Ripple";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void; id?: string };
  /**
   * A real icon, per a fitting call site (Package for an empty catalog,
   * Receipt for no sales yet), never emoji. A plain bordered text box reads
   * as a spreadsheet with nothing in it rather than a welcoming first-run
   * screen — the icon in a soft tonal circle is the fix, following the
   * same pattern Stripe and GOV.UK use for empty states. Ignored when
   * `illustration` is set.
   */
  icon?: LucideIcon;
  /**
   * One of src/components/illustrations — a hand-authored SVG for the
   * handful of moments that earn one (docs/RESEARCH-AND-PLAN.md Section
   * 4.5), takes over the icon slot when set. Most empty states should keep
   * using `icon`; illustrations are for real emotional moments, not every
   * screen.
   */
  illustration?: ComponentType<{ className?: string }>;
  /**
   * Full-screen layout with button pinned to bottom for mobile.
   * When true, the empty state expands to fill the container and positions
   * the action button at the bottom for easier thumb reach.
   */
  fullScreen?: boolean;
}

/** First-run guidance with one clear action. Never a blank screen with no explanation. */
export function EmptyState({ title, description, action, icon: Icon, illustration: Illustration, fullScreen }: EmptyStateProps) {
  if (fullScreen) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center animate-step-in">
          {Illustration ? (
            <Illustration className="mb-1 h-24 w-24 text-brand-accent" />
          ) : (
            Icon && (
              <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent/10">
                <Icon size={28} className="text-brand-accent" aria-hidden />
              </div>
            )
          )}
          <p className="text-[length:var(--font-size-title)] font-semibold text-on-surface">{title}</p>
          <p className="max-w-sm text-[length:var(--font-size-body)] text-on-surface-muted">{description}</p>
        </div>
        {action && (
          <div className="border-t border-border px-6 py-4 shrink-0">
            <RippleButton
              id={action.id}
              type="button"
              onClick={action.onClick}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] px-5 text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast"
              style={{ background: "var(--color-brand-accent)" }}
            >
              {action.label}
            </RippleButton>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-focus-block)] bg-surface-container px-6 py-14 text-center animate-step-in">
      {Illustration ? (
        <Illustration className="mb-1 h-24 w-24 text-brand-accent" />
      ) : (
        Icon && (
          <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent/10">
            <Icon size={28} className="text-brand-accent" aria-hidden />
          </div>
        )
      )}
      <p className="text-[length:var(--font-size-title)] font-semibold text-on-surface">{title}</p>
      <p className="max-w-sm text-[length:var(--font-size-body)] text-on-surface-muted">{description}</p>
      {action && (
        <RippleButton
          id={action.id}
          type="button"
          onClick={action.onClick}
          className="mt-2 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast"
          style={{ background: "var(--color-brand-accent)" }}
        >
          {action.label}
        </RippleButton>
      )}
    </div>
  );
}
