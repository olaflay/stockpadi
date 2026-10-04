"use client";

import React from "react";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export type M3SegmentedButtonProps<T extends string = string> =
  | {
      type: "single";
      options: SegmentOption<T>[];
      value: T;
      onChange: (value: T) => void;
      size?: "compact" | "default" | "large";
      ariaLabel?: string;
      className?: string;
    }
  | {
      type: "multi";
      options: SegmentOption<T>[];
      value: T[];
      onChange: (values: T[]) => void;
      size?: "compact" | "default" | "large";
      ariaLabel?: string;
      className?: string;
    };

/**
 * Material Design 3 (M3) Segmented Button / Connected Button Group.
 *
 * Text-only design (no icons) that provides clean, high-density selection:
 * - Single-Select: Mutually exclusive selection (Tabs, Views, Modes).
 * - Multi-Select: Independent multi-choice toggles (Days, Multi-tags, Multi-options).
 *
 * Visual Specs:
 * - Outer track: rounded-full border border-border/40 bg-surface-container-low p-0.5
 * - Selected: bg-surface text-on-surface font-semibold shadow-xs
 * - Unselected: text-on-surface-muted hover:text-on-surface
 * - Dividers: subtle 1px separator between adjacent unselected segments
 */
export function M3SegmentedButton<T extends string>(props: M3SegmentedButtonProps<T>) {
  const { options, size = "default", ariaLabel = "Segment options", className = "" } = props;

  const heightClass =
    size === "compact"
      ? "min-h-[34px] py-1 text-xs"
      : size === "large"
      ? "min-h-[44px] py-2 text-sm"
      : "min-h-[38px] py-1.5 text-xs sm:text-[13px]";

  const isMulti = props.type === "multi";

  function handleSelect(optionValue: T) {
    if (props.type === "single") {
      props.onChange(optionValue);
    } else {
      const current = props.value;
      if (current.includes(optionValue)) {
        props.onChange(current.filter((v) => v !== optionValue));
      } else {
        props.onChange([...current, optionValue]);
      }
    }
  }

  return (
    <div
      role={isMulti ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      className={`flex w-full items-center rounded-full bg-surface-container-low p-0.5 border border-border/35 shadow-2xs select-none ${className}`}
    >
      {options.map((option, idx) => {
        const isSelected = isMulti
          ? props.value.includes(option.value)
          : props.value === option.value;

        const nextOption = options[idx + 1];
        const nextIsSelected = nextOption
          ? isMulti
            ? props.value.includes(nextOption.value)
            : props.value === nextOption.value
          : false;

        const showDivider = !isSelected && !nextIsSelected && idx < options.length - 1;

        return (
          <React.Fragment key={option.value}>
            <button
              type="button"
              role={isMulti ? "button" : "radio"}
              aria-checked={isMulti ? undefined : isSelected}
              aria-pressed={isMulti ? isSelected : undefined}
              disabled={option.disabled}
              onClick={() => handleSelect(option.value)}
              className={`flex-1 flex items-center justify-center rounded-full px-2.5 font-medium transition-all duration-150 active:scale-[0.98] ${heightClass} ${
                option.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
              } ${
                isSelected
                  ? "bg-surface text-on-surface font-semibold shadow-xs"
                  : "text-on-surface-muted hover:text-on-surface hover:bg-surface-container-high/60"
              }`}
            >
              <span className="truncate">{option.label}</span>
            </button>
            {showDivider && (
              <span aria-hidden="true" className="h-4 w-px bg-border/40 shrink-0 self-center" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
