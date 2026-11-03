"use client";

import { useRef, type ReactNode, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  trailingAction?: ReactNode;
  autoFocus?: boolean;
  id?: string;
  className?: string;
  shape?: "default" | "segmented-start" | "segmented-middle" | "segmented-end" | "standalone";
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SearchBar({
  value,
  onChange,
  placeholder,
  ariaLabel,
  onFocus,
  onBlur,
  onKeyDown,
  trailingAction,
  autoFocus,
  id,
  className = "",
  shape = "default",
  inputRef,
}: SearchBarProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? internalRef;

const SHAPE_CLASSES: Record<string, string> = {
  default: "rounded-[var(--radius-control)] sm:rounded-[var(--radius-card)]",
  standalone: "rounded-[var(--radius-control)]",
  // Kept for API compatibility. Connected search controls now use spacing and
  // tonal containers rather than outlines or visually fused segments.
  "segmented-start": "rounded-[var(--radius-control)]",
  "segmented-middle": "rounded-[var(--radius-control)]",
  "segmented-end": "rounded-[var(--radius-control)]",
};

  const handleClear = () => {
    onChange("");
    ref.current?.focus();
  };

  return (
    <div
      className={`relative flex h-12 min-h-12 w-full items-center ${SHAPE_CLASSES[shape] ?? SHAPE_CLASSES.default} bg-surface-container-high transition-colors duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] focus-within:bg-surface-container-highest focus-within:ring-2 focus-within:ring-brand-accent ${className}`}
    >
      <Search
        size={19}
        className="pointer-events-none absolute left-3.5 text-on-surface-muted"
        aria-hidden
      />

      <input
        ref={ref}
        id={id}
        type="search"
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="search-bar-input h-12 min-h-12 min-w-0 flex-1 bg-transparent pl-11 pr-2 text-[16px] sm:text-[length:var(--font-size-body)] text-on-surface placeholder:text-on-surface-muted/70 outline-none"
      />

      <div className="relative mr-2 flex shrink-0 items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="flex h-10 w-10 min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface active:scale-[0.98] active:bg-surface-container-highest transition-all duration-[var(--motion-duration-short)] ease-[var(--easing-standard)]"
          >
            <X size={16} aria-hidden />
          </button>
        ) : null}
        {trailingAction}
      </div>
    </div>
  );
}
