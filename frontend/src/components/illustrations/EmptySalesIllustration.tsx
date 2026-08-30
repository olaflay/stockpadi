import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** "No sales yet today" — A minimalist, elegant sales ledger awaiting its first sale. */
export function EmptySalesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft ambient background glow */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.06" />

      {/* Main ledger clipboard body */}
      <rect
        x="26"
        y="22"
        width="44"
        height="56"
        rx="8"
        fill="var(--color-surface, #ffffff)"
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
        opacity="0.9"
      />
      <circle cx="48" cy="21" r="2" fill="var(--color-surface, #ffffff)" />

      {/* Crisp transaction placeholder lines */}
      <rect x="34" y="36" width="28" height="3.5" rx="1.75" fill="currentColor" opacity="0.3" />
      <rect x="34" y="46" width="22" height="3.5" rx="1.75" fill="currentColor" opacity="0.2" />
      <rect x="34" y="56" width="26" height="3.5" rx="1.75" fill="currentColor" opacity="0.15" />

      {/* Subtle modern spark badge */}
      <circle cx="64" cy="62" r="9" fill="var(--color-surface, #ffffff)" stroke="currentColor" strokeWidth="2" />
      <path {...STROKE_PROPS} strokeWidth="2" d="M64 57 V67 M59 62 H69" />
    </svg>
  );
}
