"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { ICON_TONE_CLASSES, type IconTone } from "@/components/ui/icon-tone";
import { RippleLink, RippleButton } from "@/components/ui/Ripple";

interface SettingsRowProps {
  icon?: LucideIcon;
  label: string;
  description?: string;
  trailing?: string;
  /** What this row's icon color means — see icon-tone.ts. Defaults to "neutral" for purely structural rows. */
  tone?: IconTone;
  className?: string;
  href?: string;
  onClick?: () => void;
}

/**
 * The shared row for the grouped Settings list — every row tappable, every
 * row leading somewhere. docs/RESEARCH-AND-PLAN.md Phase 2 item 17.
 * Supports Next.js prefetching via href for instant, touch-reliable navigation.
 */
export function SettingsRow({
  icon: Icon,
  label,
  description,
  trailing,
  tone = "neutral",
  className = "",
  href,
  onClick,
}: SettingsRowProps) {
  const innerContent = (
    <>
      {Icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES[tone]}`}>
          <Icon size={20} aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{label}</p>
        {description && (
          <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">{description}</p>
        )}
      </div>
      {trailing && (
        <span className="shrink-0 text-[length:var(--font-size-body)] text-on-surface-muted font-number tabular-nums">{trailing}</span>
      )}
      <ChevronRight size={18} className="shrink-0 text-on-surface-muted" aria-hidden />
    </>
  );

  const baseClassName = `relative flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 overflow-hidden px-4 py-3.5 text-left hover:bg-surface-container-high transition-colors ${className}`;

  if (href) {
    return (
      <RippleLink href={href} className={baseClassName}>
        {innerContent}
      </RippleLink>
    );
  }

  return (
    <RippleButton
      type="button"
      onClick={onClick}
      className={baseClassName}
    >
      {innerContent}
    </RippleButton>
  );
}
