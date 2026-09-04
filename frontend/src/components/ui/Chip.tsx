"use client";

import React from "react";
import { X, type LucideIcon } from "lucide-react";

export type ChipVariant = "filter" | "assist" | "input";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ChipVariant;
  selected?: boolean;
  icon?: LucideIcon;
  onRemove?: () => void;
  children: React.ReactNode;
}

/**
 * Material Design 3 Chip Component.
 * Engineered with pure CSS compositor scaling (active:scale-[0.96]) for
 * instantaneous tap feedback on budget Android devices with zero JS reflows.
 * 
 * Variants:
 * - filter: For toggling categories/filters (with aria-pressed)
 * - assist: For triggering helper tasks (barcode scan, quick templates)
 * - input: For removable tags with a trailing dismiss icon
 */
export function Chip({
  variant = "filter",
  selected = false,
  icon: Icon,
  onRemove,
  children,
  className = "",
  disabled = false,
  ...props
}: ChipProps) {
  const baseClasses =
    "inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--font-size-label)] font-medium select-none touch-manipulation transition-all duration-[var(--motion-duration-short)] ease-out disabled:opacity-40 disabled:pointer-events-none active:scale-[0.96]";

  let stateClasses = "";

  if (variant === "filter") {
    stateClasses = selected
      ? "bg-brand-accent text-brand-accent-contrast border border-transparent shadow-xs"
      : "bg-surface-container-high border border-border/80 text-on-surface hover:bg-surface-container-highest";
  } else if (variant === "assist") {
    stateClasses =
      "bg-surface border border-border/80 text-on-surface hover:bg-surface-container active:bg-surface-container-high";
  } else if (variant === "input") {
    stateClasses =
      "bg-surface-container border border-border/80 text-on-surface pr-1.5 hover:bg-surface-container-high";
  }

  return (
    <button
      type="button"
      aria-pressed={variant === "filter" ? selected : undefined}
      disabled={disabled}
      className={`${baseClasses} ${stateClasses} ${className}`}
      {...props}
    >
      {Icon && <Icon size={14} className="shrink-0" aria-hidden />}
      <span>{children}</span>
      {variant === "input" && onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
              onRemove();
            }
          }}
          className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-on-surface-muted hover:bg-black/10 active:scale-90 transition-all"
          aria-label="Remove"
        >
          <X size={12} aria-hidden />
        </span>
      )}
    </button>
  );
}
