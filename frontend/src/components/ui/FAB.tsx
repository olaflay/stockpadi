import type { ReactNode } from "react";
import { RippleLink, RippleButton } from "@/components/ui/Ripple";

interface FABProps {
  href?: string;
  onClick?: () => void;
  label: string;
  id?: string;
  children: ReactNode;
}

/**
 * The single primary-action button pattern for list screens.
 * Supports either direct navigation via `href` or zero-latency sheet opening via `onClick`.
 */
export function FAB({ href, onClick, label, id, children }: FABProps) {
  const commonClass =
    "fixed bottom-16 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] bg-brand-accent text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] active:scale-95 transition-transform";

  if (onClick) {
    return (
      <RippleButton
        id={id}
        type="button"
        onClick={onClick}
        className={commonClass}
        aria-label={label}
      >
        {children}
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
      {children}
    </RippleLink>
  );
}
