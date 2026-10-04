"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface FilterOption<T extends string = string> {
  value: T;
  label: string;
}

export interface FilterGroup<T extends string = string> {
  id: string;
  label: string; // e.g. "All Categories" or "Category"
  options: FilterOption<T>[];
  selectedValue: T;
  onChange: (value: T) => void;
  /** Optional custom display for the trigger button */
  renderTriggerLabel?: (selectedValue: T, options: FilterOption<T>[]) => string;
}

export interface FilterDropdownBarProps {
  filters: FilterGroup[];
  className?: string;
  ariaLabel?: string;
}

/**
 * Fintech & M3 Filter Dropdown Bar with inline expanding pill option tray.
 *
 * Matches the mobile financial transaction UI:
 * - Top row of pill buttons: [ All Categories ▼ ]  [ All Status ▲ ]
 * - Active / Open filter highlights with accent border/tint and arrow up.
 * - Smooth expanding tray below the buttons containing pill choices.
 * - Selected pill: solid brand accent background.
 * - Inactive pills: dark/elevated surface containers.
 */
export function FilterDropdownBar({
  filters,
  className = "",
  ariaLabel = "Filter transactions",
}: FilterDropdownBarProps) {
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenFilterId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenFilterId(null);
      }
    }

    if (openFilterId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [openFilterId]);

  const activeGroup = filters.find((f) => f.id === openFilterId);

  return (
    <div ref={containerRef} className={`flex flex-col gap-2.5 ${className}`} aria-label={ariaLabel}>
      {/* Top Filter Buttons Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
        {filters.map((group) => {
          const isOpen = openFilterId === group.id;
          const currentOption = group.options.find((o) => o.value === group.selectedValue);
          const isNonDefault = group.options.length > 0 && group.selectedValue !== group.options[0].value;
          const labelText = group.renderTriggerLabel
            ? group.renderTriggerLabel(group.selectedValue, group.options)
            : currentOption?.label || group.label;

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setOpenFilterId(isOpen ? null : group.id)}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              className={`min-h-[38px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-[var(--radius-control)] text-xs font-medium transition-all duration-150 shrink-0 ${
                isOpen || isNonDefault
                  ? "border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-active font-semibold shadow-xs"
                  : "border border-border/40 bg-surface-container text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <span className="truncate max-w-[140px]">{labelText}</span>
              {isOpen ? (
                <ChevronUp size={14} className="shrink-0 text-brand-accent-active" aria-hidden />
              ) : (
                <ChevronDown size={14} className="shrink-0 text-on-surface-muted" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/* Expanding Pill Options Tray */}
      {activeGroup && (
        <div
          role="listbox"
          aria-label={activeGroup.label}
          className="rounded-2xl border border-border/30 bg-surface-container-low p-3 shadow-sm animate-step-in"
        >
          <div className="flex flex-wrap gap-2">
            {activeGroup.options.map((option) => {
              const isSelected = activeGroup.selectedValue === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    activeGroup.onChange(option.value);
                    // Optional: keep tray or close on selection
                    setOpenFilterId(null);
                  }}
                  className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-150 ${
                    isSelected
                      ? "bg-brand-accent text-brand-accent-contrast font-semibold shadow-xs"
                      : "bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
