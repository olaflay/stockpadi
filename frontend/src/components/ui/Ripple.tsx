"use client";

import { useCallback, useState } from "react";
import Link, { type LinkProps } from "next/link";

interface RippleSpan {
  id: number;
  x: number;
  y: number;
  size: number;
}

/**
 * Material's press ripple, not a hover tint: a circle expands from the
 * exact tap point and fades, using the state-layer opacity/motion tokens
 * already named for this in tokens.css (never wired up until now). Attach
 * `onPointerDown` to the tappable element (which needs `relative
 * overflow-hidden`) and render `<RippleLayer ripples={ripples} />` inside it.
 */
export function useRipple() {
  const [ripples, setRipples] = useState<RippleSpan[]>([]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const id = Date.now();
    setRipples((current) => [
      ...current,
      { id, x: event.clientX - rect.left - size / 2, y: event.clientY - rect.top - size / 2, size },
    ]);
    window.setTimeout(() => {
      setRipples((current) => current.filter((ripple) => ripple.id !== id));
    }, 150);
  }, []);

  return { ripples, onPointerDown };
}

export function RippleLayer({ ripples }: { ripples: RippleSpan[] }) {
  return (
    <>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          aria-hidden
          className="animate-ripple pointer-events-none absolute rounded-full bg-current opacity-[0.06]"
          style={{ left: ripple.x, top: ripple.y, width: ripple.size, height: ripple.size }}
        />
      ))}
    </>
  );
}

/**
 * Drop-in `<button>` replacement carrying its own ripple state — safe to
 * use inside a `.map()` since each rendered instance owns its own hook
 * call. Adds `relative overflow-hidden` itself; callers don't need to.
 */
export function RippleButton({
  className = "",
  onPointerDown,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ripples, onPointerDown: startRipple } = useRipple();
  const hasPosition = className.includes("fixed") || className.includes("absolute") || className.includes("relative");
  const positionClass = hasPosition ? "" : "relative";
  return (
    <button
      {...props}
      onPointerDown={(event) => {
        startRipple(event);
        onPointerDown?.(event);
      }}
      className={`${positionClass} overflow-hidden ${className}`}
    >
      <RippleLayer ripples={ripples} />
      {children}
    </button>
  );
}

/** Same idea as RippleButton, for Next.js Link-as-card rows (e.g. product list items). */
export function RippleLink({
  className = "",
  onPointerDown,
  children,
  ...props
}: LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onPointerDown"> & {
    children?: React.ReactNode;
    onPointerDown?: (event: React.PointerEvent<HTMLAnchorElement>) => void;
  }) {
  const { ripples, onPointerDown: startRipple } = useRipple();
  const hasPosition = className.includes("fixed") || className.includes("absolute") || className.includes("relative");
  const positionClass = hasPosition ? "" : "relative";
  return (
    <Link
      {...props}
      onPointerDown={(event) => {
        startRipple(event);
        onPointerDown?.(event);
      }}
      className={`${positionClass} overflow-hidden ${className}`}
    >
      <RippleLayer ripples={ripples} />
      {children}
    </Link>
  );
}
