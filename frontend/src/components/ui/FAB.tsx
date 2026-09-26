import type { ReactNode } from "react";
import { RippleLink, RippleButton } from "@/components/ui/Ripple";

interface FABProps {
  href?: string;
  onClick?: () => void;
  label: string;
  id?: string;
  size?: "sm" | "md" | "lg";
  extended?: boolean;
  children: ReactNode;
}

/**
 * The single primary-action button pattern for list screens.
 * Supports either direct navigation via `href` or zero-latency sheet opening via `onClick`.
 * Aligned with Material 3: 16dp corners (rounded-2xl), elevation depth states, and optional extended variant.
 */
export function FAB({ href, onClick, label, id, size = "md", extended = false, children }: FABProps) {
  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-14 w-14",
    lg: "h-20 w-20",
  }[size];

  const commonClass = extended
    ? "fixed bottom-22 sm:bottom-24 right-5 sm:right-6 z-[var(--z-fab,50)] flex h-14 min-w-[5rem] px-5 items-center justify-center gap-2.5 rounded-2xl bg-brand-accent text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] active:shadow-[var(--shadow-elevation-1)] active:scale-95 transition-all"
    : `fixed bottom-22 sm:bottom-24 right-5 sm:right-6 z-[var(--z-fab,50)] flex ${sizeClasses} items-center justify-center rounded-2xl bg-brand-accent text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] active:shadow-[var(--shadow-elevation-1)] active:scale-95 transition-all`;

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
    >
      {content}
    </RippleLink>
  );
}
