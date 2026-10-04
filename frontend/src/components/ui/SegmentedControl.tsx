"use client";

import React from "react";

interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  selected: string;
  onChange: (value: string) => void;
  /** "compact" = 36px height (inline filters), "default" = 40px (section tabs) */
  size?: "compact" | "default";
  /** Accessible label for the group */
  ariaLabel?: string;
}

/**
 * M3 Segmented Button — a compact, unified track with 2–5 mutually exclusive options.
 *
 * Use for toggling *views* or *time lenses* on the same data (e.g. Overview|Sales|Inventory,
 * Today|This week|This month). Text-only — no icons — because the labels are
 * self-explanatory and icons compete with page content.
 *
 * Visual spec:
 *   ├── Single rounded track: bg-surface-container-low, 1px border
 *   ├── Active segment: bg-surface, shadow-xs, text-on-surface font-semibold
 *   ├── Inactive segments: text-on-surface-muted
 *   ├── Equal-width segments (flex-1)
 *   └── Smooth 150ms transition on selection change
 */
export function SegmentedControl({
  options,
  selected,
  onChange,
  size = "default",
  ariaLabel = "View options",
}: SegmentedControlProps) {
  const heightClass = size === "compact" ? "min-h-[36px]" : "min-h-[40px]";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-surface-container-low p-0.5 border border-border/30"
    >
      {options.map((option) => {
        const isActive = selected === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={`flex-1 flex items-center justify-center rounded-[calc(var(--radius-control)-2px)] px-3 text-xs font-medium transition-all duration-150 ${heightClass} ${
              isActive
                ? "bg-surface text-on-surface font-semibold shadow-xs"
                : "text-on-surface-muted hover:text-on-surface"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
