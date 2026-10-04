"use client";

import React, { useState, useRef, useEffect, useId, useCallback, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { useTooltipContext } from "@/components/ui/TooltipContext";

interface InfoTooltipProps {
  text: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * M3 Plain/Rich Tooltip Popover — Singleton & Portal-Anchored.
 * 
 * Guaranteed:
 * 1. Rendered via createPortal to document.body: NEVER clipped by card overflow, table scroll, or stacking contexts.
 * 2. Viewport-aware: dynamically calculates anchor position via getBoundingClientRect(). Automatically flips below the anchor if near top of screen, and clamps horizontally within safe screen margins.
 * 3. Singleton: Only one tooltip open at a time globally across the app (opening another auto-closes previous).
 * 4. Auto-dismiss: Closes on outside tap, Escape key, or window scroll.
 */
export function InfoTooltip({ text, ariaLabel = "More information", className = "" }: InfoTooltipProps) {
  const tooltipId = useId();
  const { activeTooltipId, openTooltip, closeTooltip } = useTooltipContext();
  const isOpen = activeTooltipId === tooltipId;

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    arrowLeft: number;
    isBelow: boolean;
  }>({
    top: 0,
    left: 0,
    arrowLeft: 0,
    isBelow: false,
  });

  const close = useCallback(() => closeTooltip(tooltipId), [closeTooltip, tooltipId]);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const triggerRect = buttonRef.current.getBoundingClientRect();
    const tooltipWidth = 220;
    const estimatedHeight = 70;
    const margin = 12;
    const viewportWidth = window.innerWidth;

    // Vertical positioning: default above, flip below if too close to viewport top
    const isBelow = triggerRect.top < estimatedHeight + margin;
    const top = isBelow
      ? triggerRect.bottom + 6
      : Math.max(margin, triggerRect.top - estimatedHeight - 6);

    // Horizontal positioning: center on trigger, clamped to screen bounds
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    let left = triggerCenter - tooltipWidth / 2;
    if (left < margin) {
      left = margin;
    } else if (left + tooltipWidth > viewportWidth - margin) {
      left = Math.max(margin, viewportWidth - tooltipWidth - margin);
    }

    // Arrow pointer: aligns directly with triggerCenter relative to tooltip container
    const arrowLeft = Math.max(12, Math.min(tooltipWidth - 12, triggerCenter - left));

    setCoords({ top, left, arrowLeft, isBelow });
  }, []);

  // Update position on open and listen to scroll / resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      close();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    const handleScrollOrResize = () => close();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, close, updatePosition]);

  return (
    <>
      <span className={`inline-flex items-center align-middle ${className}`}>
        <button
          ref={buttonRef}
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
      </span>

      {isOpen && isClient && typeof document !== "undefined" && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="fixed z-[9999] w-[220px] max-w-[calc(100vw-24px)] rounded-xl border border-border/80 bg-surface-container-highest p-2.5 text-[11px] font-normal text-on-surface shadow-[var(--shadow-elevation-3)] leading-relaxed select-text pointer-events-auto animate-fade-in"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
          }}
        >
          <div className="flex items-start justify-between gap-1.5">
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
          </div>
          <span
            className={`absolute border-4 border-transparent ${
              coords.isBelow
                ? "bottom-full border-b-surface-container-highest -mb-px"
                : "top-full border-t-surface-container-highest -mt-px"
            }`}
            style={{ left: `${coords.arrowLeft}px`, transform: "translateX(-50%)" }}
          />
        </div>,
        document.body
      )}
    </>
  );
}
