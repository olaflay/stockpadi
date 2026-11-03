"use client";

import React, { forwardRef } from "react";
import { useRipple, RippleLayer } from "@/components/ui/Ripple";

export type ButtonVariant = "primary" | "secondary" | "tonal" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  hasTabularFigures?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-accent text-brand-accent-contrast shadow-elevation-1 hover:brightness-105 active:scale-[0.98] active:brightness-95",
  secondary:
    "border border-border bg-surface text-on-surface hover:bg-surface-container active:scale-[0.98] active:bg-surface-container-high",
  tonal:
    "bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-[0.98] active:bg-surface-container-highest",
  danger:
    "bg-danger text-on-danger shadow-elevation-1 hover:brightness-105 active:scale-[0.98] active:brightness-95",
  ghost:
    "bg-transparent text-on-surface-muted hover:text-on-surface hover:bg-surface-container/60 active:scale-[0.98] active:bg-surface-container",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[48px] px-3.5 py-2 text-[length:var(--font-size-label)]",
  md: "min-h-[48px] px-5 py-3 text-[length:var(--font-size-body)]",
  lg: "min-h-[56px] px-6 py-3.5 text-[length:var(--font-size-body-lg)] font-bold",
};

/**
 * Button — Foundational interactive primitive for OjàPadi.
 *
 * Enforces:
 * 1. Mobile touch target floor (min-h-[48px], min-w-[48px]).
 * 2. Tactile feedback (active:scale-[0.98], contrast dip, token-driven motion easing, Material tap ripple).
 * 3. Token-consistent shape and typography (var(--radius-control), semantic typography scale).
 * 4. Numeric scannability (tabular-nums support for currencies and figures).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    loadingText,
    leftIcon,
    rightIcon,
    hasTabularFigures = false,
    className = "",
    disabled,
    children,
    onPointerDown,
    type = "button",
    ...props
  },
  ref
) {
  const { ripples, onPointerDown: startRipple } = useRipple();
  const isDisabled = disabled || isLoading;

  const baseClasses =
    "relative inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-all duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] outline-none focus-visible:ring-2 focus-visible:ring-brand-accent overflow-hidden select-none";

  const stateClasses = isDisabled
    ? "opacity-40 pointer-events-none cursor-not-allowed shadow-none active:scale-100"
    : "cursor-pointer";

  const numClasses = hasTabularFigures ? "tabular-nums" : "";

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading ? "true" : undefined}
      onPointerDown={(event) => {
        if (!isDisabled) {
          startRipple(event);
        }
        onPointerDown?.(event);
      }}
      className={`${baseClasses} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${stateClasses} ${numClasses} ${className}`}
      {...props}
    >
      <RippleLayer ripples={ripples} />

      {isLoading ? (
        <>
          <span
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
          {loadingText ? <span>{loadingText}</span> : children}
        </>
      ) : (
        <>
          {leftIcon && <span className="shrink-0" aria-hidden>{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0" aria-hidden>{rightIcon}</span>}
        </>
      )}
    </button>
  );
});
