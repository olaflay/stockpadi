import { ILLUSTRATION_VIEWBOX } from "./shared";

/** "No sales yet today" — A minimalist, elegant sales ledger adhering strictly to the design token color system. */
export function EmptySalesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft ambient background glow */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />

      {/* Main ledger clipboard body — uses surface-container-high so it never turns black in dark mode */}
      <rect
        x="26"
        y="22"
        width="44"
        height="56"
        rx="8"
        fill="var(--color-surface-container-high)"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      {/* Modern top clip mechanism */}
      <rect
        x="38"
        y="16"
        width="20"
        height="10"
        rx="3"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="48" cy="21" r="2" fill="var(--color-surface-container-high)" />

      {/* Crisp transaction placeholder lines */}
      <rect x="34" y="36" width="28" height="3.5" rx="1.75" fill="currentColor" opacity="0.35" />
      <rect x="34" y="46" width="22" height="3.5" rx="1.75" fill="currentColor" opacity="0.25" />
      <rect x="34" y="56" width="26" height="3.5" rx="1.75" fill="currentColor" opacity="0.2" />

      {/* Subtle modern brand spark badge */}
      <circle cx="64" cy="62" r="9" fill="var(--color-surface-container-high)" stroke="currentColor" strokeWidth="2" />
      <circle cx="64" cy="62" r="7" fill="var(--color-brand-accent)" />
      <path d="M64 58.5 V65.5 M60.5 62 H67.5" stroke="var(--color-brand-accent-contrast)" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
