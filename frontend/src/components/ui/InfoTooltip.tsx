"use client";

import React, { useState, useRef, useEffect, useId, useCallback } from "react";
import { Info, X } from "lucide-react";
import { useTooltipContext } from "@/components/ui/TooltipContext";

interface InfoTooltipProps {
  text: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Compact (i) button that toggles an accessible, space-saving tooltip popover.
 * Eliminates paragraph helper text bloat underneath form fields on mobile screens.
 *
 * Singleton: only one InfoTooltip can be open at a time across the entire app.
 * Viewport-aware: repositions itself to stay within screen bounds.
 * Auto-dismiss: closes on scroll.
 */
export function InfoTooltip({ text, ariaLabel = "More information", className = "" }: InfoTooltipProps) {
  const tooltipId = useId();
  const { activeTooltipId, openTooltip, closeTooltip } = useTooltipContext();
  const isOpen = activeTooltipId === tooltipId;

  const containerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [nudgeX, setNudgeX] = useState(0);

  const close = useCallback(() => closeTooltip(tooltipId), [closeTooltip, tooltipId]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    // Auto-dismiss on scroll (M3 transient tooltip behavior)
    const handleScroll = () => close();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen, close]);

  // Viewport-aware positioning: nudge tooltip horizontally if it overflows
  useEffect(() => {
    if (!isOpen || !tooltipRef.current) {
      setNudgeX(0);
      return;
    }

    const rect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const safeMargin = 12;

    if (rect.left < safeMargin) {
      setNudgeX(safeMargin - rect.left);
    } else if (rect.right > viewportWidth - safeMargin) {
      setNudgeX(viewportWidth - safeMargin - rect.right);
    } else {
      setNudgeX(0);
    }
  }, [isOpen]);

  return (
    <span ref={containerRef} className={`relative inline-flex items-center align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) {
            close();
          } else {
            openTooltip(tooltipId);
          }
        }}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-on-surface-muted hover:text-brand-accent hover:bg-surface-container-high transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-accent"
      >
        <Info size={13} aria-hidden />
      </button>

      {isOpen && (
        <span
          ref={tooltipRef}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-52 max-w-[calc(100vw-3rem)] rounded-xl border border-border/80 bg-surface-container-highest p-2.5 text-[11px] font-normal text-on-surface shadow-[var(--shadow-elevation-2)] leading-relaxed select-text pointer-events-auto"
          style={nudgeX !== 0 ? { transform: `translateX(calc(-50% + ${nudgeX}px))` } : undefined}
        >
          <span className="flex items-start justify-between gap-1.5">
            <span>{text}</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
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
