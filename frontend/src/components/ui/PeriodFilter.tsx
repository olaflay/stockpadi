"use client";

import React from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export interface PeriodOption {
  value: string;
  label: string;
}

interface PeriodFilterProps {
  options: PeriodOption[];
  selected: string;
  onChange: (value: string) => void;
  enableCustomRange?: boolean;
  customRange?: { start: string; end: string };
  onCustomRangeChange?: (range: { start: string; end: string }) => void;
  size?: "compact" | "default";
  ariaLabel?: string;
}

/**
 * Shared PeriodFilter engine.
 * Renders a compact, unified M3 SegmentedControl for period selection (no icons, text-only).
 * When "custom" is active and custom range is enabled, renders clean inline date inputs
 * without card wrapper or unnecessary icons.
 */
export function PeriodFilter({
  options,
  selected,
  onChange,
  enableCustomRange = false,
  customRange,
  onCustomRangeChange,
  size = "compact",
  ariaLabel = "Filter period",
}: PeriodFilterProps) {
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        options={options}
        selected={selected}
        onChange={onChange}
        size={size}
        ariaLabel={ariaLabel}
      />

      {enableCustomRange && selected === "custom" && (
        <div className="flex items-center gap-2 pt-1 animate-step-in">
          <label className="flex-1 flex flex-col gap-1 text-[11px] text-on-surface-muted font-medium">
            <span>From</span>
            <input
              type="date"
              aria-label="Start date"
              value={customRange?.start ? customRange.start.slice(0, 10) : ""}
              onChange={(e) =>
                onCustomRangeChange?.({
                  start: e.target.value,
                  end: customRange?.end ?? new Date().toISOString().slice(0, 10),
                })
              }
              className="w-full rounded-[var(--radius-control)] border border-border/40 bg-surface px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </label>
          <label className="flex-1 flex flex-col gap-1 text-[11px] text-on-surface-muted font-medium">
            <span>To</span>
            <input
              type="date"
              aria-label="End date"
              value={customRange?.end ? customRange.end.slice(0, 10) : ""}
              onChange={(e) =>
                onCustomRangeChange?.({
                  start: customRange?.start ?? new Date().toISOString().slice(0, 10),
                  end: e.target.value,
                })
              }
              className="w-full rounded-[var(--radius-control)] border border-border/40 bg-surface px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </label>
        </div>
      )}
    </div>
  );
}
