import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { RippleLink, RippleButton } from "@/components/ui/Ripple";

interface FABProps {
  href?: string;
  onClick?: () => void;
  label: string;
  id?: string;
  size?: "sm" | "md" | "lg";
  extended?: boolean;
  children: ReactNode;
  autoHideOnScroll?: boolean;
}

/**
 * The single primary-action button pattern for list screens.
 * Supports either direct navigation via `href` or zero-latency sheet opening via `onClick`.
 * Aligned with Material 3: 16dp corners (rounded-2xl), elevation depth states, and optional extended variant.
 */
export function FAB({ href, onClick, label, id, size = "md", extended = false, autoHideOnScroll = false, children }: FABProps) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!autoHideOnScroll) return;
    const scrollRegion = document.querySelector("main.overflow-y-auto");
    if (!scrollRegion) return;
    let previous = scrollRegion.scrollTop;
    const onScroll = () => {
      const current = scrollRegion.scrollTop;
      const distance = current - previous;
      if (Math.abs(distance) >= 6) {
        setVisible(current < 80 || distance < 0);
        previous = current;
      }
    };
    scrollRegion.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollRegion.removeEventListener("scroll", onScroll);
  }, [autoHideOnScroll]);
  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-20 w-20",
  }[size];

  const commonClass = extended
    ? `fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-5 z-[var(--z-fab)] flex h-14 min-w-[5rem] touch-manipulation items-center justify-center gap-2.5 rounded-2xl bg-brand-accent px-5 text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] transition-[transform,opacity,box-shadow,filter] duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] motion-reduce:transition-none active:scale-[0.98] active:brightness-95 active:shadow-[var(--shadow-elevation-1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 sm:right-6 ${autoHideOnScroll && !visible ? "translate-y-4 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`
    : `fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-5 z-[var(--z-fab)] flex ${sizeClasses} touch-manipulation items-center justify-center rounded-2xl bg-brand-accent text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] transition-[transform,opacity,box-shadow,filter] duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] motion-reduce:transition-none active:scale-[0.98] active:brightness-95 active:shadow-[var(--shadow-elevation-1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 sm:right-6 ${autoHideOnScroll && !visible ? "translate-y-4 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"}`;

  const content = (
    <>
      {children}
      {extended && <span className="font-medium text-[length:var(--font-size-body)]">{label}</span>}
    </>
  );

  if (onClick) {
    return (
      <RippleButton
        id={id}
        type="button"
        onClick={onClick}
        className={commonClass}
        aria-label={label}
        aria-hidden={autoHideOnScroll && !visible}
        tabIndex={autoHideOnScroll && !visible ? -1 : undefined}
      >
        {content}
      </RippleButton>
    );
  }

  return (
    <RippleLink
      id={id}
      href={href ?? "#"}
      className={commonClass}
      aria-label={label}
      aria-hidden={autoHideOnScroll && !visible}
      tabIndex={autoHideOnScroll && !visible ? -1 : undefined}
    >
      {content}
    </RippleLink>
  );
}
