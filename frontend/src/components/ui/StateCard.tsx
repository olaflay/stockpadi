/**
 * StateCard — the single layout primitive behind every non-ideal screen state.
 *
 * Lead system: Samsung One UI (focus block) + M3 tonal container.
 * Per `.agents/rules/design-system.md`, all state views (EmptyState,
 * NoResultsState, ErrorState, PermissionDenied, offline pages) must share one
 * layout: `max-w-sm` container, 56px tonal icon circle, `title-lg` bold
 * heading, `body` muted description, and standardized primary/secondary
 * actions. This file owns that layout so the states cannot drift apart.
 *
 * Every value comes from a token. No hardcoded hex or pixel values.
 */
"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";

export type StateCardTone = "brand" | "neutral" | "warning" | "danger";

interface StateCardProps {
  /** Heading. Sentence case per the UX writing standard. */
  title: string;
  /** Plain-language explanation. Say what happened and what to do next. */
  description: ReactNode;
  /** 56px tonal icon circle. Omit when an illustration is supplied. */
  icon?: LucideIcon;
  /** Hand-authored SVG illustration, used for emotional moments. */
  illustration?: ComponentType<{ className?: string }>;
  tone?: StateCardTone;
  /** Primary action. The CTA that leaves this state. */
  action?: { label: string; onClick?: () => void; href?: string; id?: string };
  /** Secondary action. Rendered as a quiet text button below the primary. */
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
  role?: "status" | "alert";
  className?: string;
}

/** Tonal container/colour pair per tone, so meaning is carried by colour. */
const TONE_CLASSES: Record<StateCardTone, string> = {
  brand: "bg-brand-accent/10 text-brand-accent",
  neutral: "bg-surface-container-high text-on-surface-muted",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/10 text-danger",
};

/** Card surface treatment per tone. */
const CARD_CLASSES: Record<StateCardTone, string> = {
  brand: "depth-card",
  neutral: "depth-card",
  warning: "depth-card",
  danger: "depth-card border-danger/30 bg-danger/[0.04]",
};

export function StateCard({
  title,
  description,
  icon: Icon,
  illustration: Illustration,
  tone = "neutral",
  action,
  secondaryAction,
  role = "status",
  className,
}: StateCardProps) {
  return (
    <div
      role={role}
      className={`flex flex-1 w-full max-w-sm mx-auto flex-col justify-between my-auto rounded-2xl ${CARD_CLASSES[tone]} p-6 sm:p-7 overflow-hidden animate-step-in select-none ${className ?? ""}`}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center py-2 sm:py-4">
        {Illustration ? (
          <Illustration className="mb-4 h-22 w-22 sm:h-24 sm:w-24 text-brand-accent shrink-0" />
        ) : (
          Icon && (
            <div
              className={`mb-3.5 flex h-14 w-14 items-center justify-center rounded-full shrink-0 depth-bubble ${TONE_CLASSES[tone]}`}
            >
              <Icon size={26} aria-hidden />
            </div>
          )
        )}

        <p className="text-[length:var(--font-size-title-lg)] font-bold text-on-surface leading-snug">
          {title}
        </p>

        <div className="mt-2 max-w-xs text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed">
          {description}
        </div>
      </div>

      {(action || secondaryAction) && (
        <div className="w-full pt-4 mt-auto">
          {action &&
            (action.href ? (
              <RippleLink
                id={action.id}
                href={action.href}
                className="w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 py-3 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-sm hover:opacity-95 active:scale-[0.98] transition-all inline-flex items-center justify-center cursor-pointer text-center"
              >
                {action.label}
              </RippleLink>
            ) : (
              <RippleButton
                id={action.id}
                type="button"
                onClick={action.onClick}
                className="w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 py-3 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast shadow-sm hover:opacity-95 active:scale-[0.98] transition-all inline-flex items-center justify-center cursor-pointer"
              >
                {action.label}
              </RippleButton>
            ))}

          {secondaryAction &&
            (secondaryAction.href ? (
              <RippleLink
                href={secondaryAction.href}
                className="mt-2 w-full min-h-[var(--touch-target-min)] inline-flex items-center justify-center text-[length:var(--font-size-label)] font-semibold text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
              >
                {secondaryAction.label}
              </RippleLink>
            ) : (
              <RippleButton
                type="button"
                onClick={secondaryAction.onClick}
                className="mt-2 w-full min-h-[var(--touch-target-min)] inline-flex items-center justify-center text-[length:var(--font-size-label)] font-semibold text-on-surface-muted hover:text-on-surface transition-colors cursor-pointer"
              >
                {secondaryAction.label}
              </RippleButton>
            ))}
        </div>
      )}
    </div>
  );
}
