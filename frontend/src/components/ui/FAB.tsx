import type { ReactNode } from "react";
import { RippleLink } from "@/components/ui/Ripple";

interface FABProps {
  href: string;
  label: string;
  id?: string;
  children: ReactNode;
}

/**
 * The single primary-action button pattern for list screens (Products,
 * Expenses, Restocks, Sales) — always in the same place regardless of
 * whether the list is empty or populated, so it never changes shape or
 * position on the user as content loads in.
 */
export function FAB({ href, label, id, children }: FABProps) {
  return (
    <RippleLink
      id={id}
      href={href}
      className="fixed bottom-16 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] bg-brand-accent text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] active:scale-95 transition-transform"
      aria-label={label}
    >
      {children}
    </RippleLink>
  );
}
