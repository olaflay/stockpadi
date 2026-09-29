"use client";

import React, { useState, useRef, useEffect } from "react";
import { Info, X } from "lucide-react";

interface InfoTooltipProps {
  text: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Compact (i) button that toggles an accessible, space-saving tooltip popover.
 * Eliminates paragraph helper text bloat underneath form fields on mobile screens.
 */
export function InfoTooltip({ text, ariaLabel = "More information", className = "" }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <span ref={containerRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-on-surface-muted hover:text-brand-accent hover:bg-surface-container-high transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-accent"
      >
        <Info size={13} aria-hidden />
      </button>

      {isOpen && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-52 max-w-[calc(100vw-3rem)] rounded-xl border border-border/80 bg-surface-container-highest p-2.5 text-[11px] font-normal text-on-surface shadow-[var(--shadow-elevation-2)] leading-relaxed select-text pointer-events-auto"
        >
          <span className="flex items-start justify-between gap-1.5">
            <span>{text}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="text-on-surface-muted hover:text-on-surface shrink-0 -mr-0.5 -mt-0.5 p-0.5"
              aria-label="Close info"
            >
              <X size={11} aria-hidden />
            </button>
          </span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-surface-container-highest" />
        </span>
      )}
    </span>
  );
}
