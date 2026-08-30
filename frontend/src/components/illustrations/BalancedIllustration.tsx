import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Close day balanced — The nightly reward when counted cash and ledger match perfectly. */
export function BalancedIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft emerald ambient glow */}
      <circle cx="48" cy="48" r="44" fill="var(--color-success)" opacity="0.12" />
      <circle cx="48" cy="48" r="34" fill="var(--color-success)" opacity="0.08" />

      {/* Center column & base */}
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M48 24 V66" />
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M34 66 H62" />

      {/* Balanced cross-beam with pivot */}
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M22 34 H74" />
      <circle cx="48" cy="34" r="3.5" fill="var(--color-success)" />

      {/* Left scale pan with elevated container */}
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M22 34 L18 48 H32 L28 34" />
      <path
        d="M18 48 C18 54 32 54 32 48 Z"
        fill="var(--color-success-container)"
        stroke="var(--color-success)"
        strokeWidth="1.5"
      />

      {/* Right scale pan with elevated container */}
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M74 34 L70 48 H84 L80 34" />
      <path
        d="M70 48 C70 54 84 54 84 48 Z"
        fill="var(--color-success-container)"
        stroke="var(--color-success)"
        strokeWidth="1.5"
      />

      {/* Verified Success Badge */}
      <circle cx="48" cy="74" r="11" fill="var(--color-success)" />
      <path
        d="M43 74 L46.5 77.5 L53.5 70.5"
        stroke="var(--color-on-success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
