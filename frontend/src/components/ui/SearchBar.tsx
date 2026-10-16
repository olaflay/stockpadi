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
  inputRef,
}: SearchBarProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? internalRef;

  const handleClear = () => {
    onChange("");
    ref.current?.focus();
  };

  return (
    <div
      className={`relative flex min-h-[48px] w-full items-center rounded-2xl bg-surface-container-high transition-all focus-within:bg-surface-container-highest focus-within:ring-2 focus-within:ring-brand-accent ${className}`}
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
        className="search-bar-input h-full min-h-[48px] min-w-0 flex-1 bg-transparent pl-11 pr-2 text-[length:var(--font-size-body)] text-on-surface placeholder:text-on-surface-muted/70 outline-none"
      />

      <div className="relative mr-2 flex shrink-0 items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="flex h-8 w-8 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface active:scale-90 transition-all"
          >
            <X size={16} aria-hidden />
          </button>
        ) : null}
        {trailingAction}
      </div>
    </div>
  );
}
