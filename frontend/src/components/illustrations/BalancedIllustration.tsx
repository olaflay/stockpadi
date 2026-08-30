import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Close day balanced — The nightly reward when counted cash and ledger match perfectly. */
export function BalancedIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft emerald ambient glow */}
      <circle cx="48" cy="48" r="44" fill="var(--color-success, #10b981)" opacity="0.08" />
      <circle cx="48" cy="48" r="34" fill="var(--color-success, #10b981)" opacity="0.06" />

      {/* Center column & base */}
      <path {...STROKE_PROPS} stroke="var(--color-success, #10b981)" d="M48 24 V66" />
      <path {...STROKE_PROPS} stroke="var(--color-success, #10b981)" d="M34 66 H62" />

      {/* Balanced cross-beam with pivot */}
      <path {...STROKE_PROPS} stroke="var(--color-success, #10b981)" d="M22 34 H74" />
      <circle cx="48" cy="34" r="3.5" fill="var(--color-success, #10b981)" />

      {/* Left scale pan */}
      <path {...STROKE_PROPS} stroke="var(--color-success, #10b981)" d="M22 34 L18 48 H32 L28 34" />
      <path
        d="M17 48 C17 54 33 54 33 48 Z"
        fill="var(--color-success, #10b981)"
        opacity="0.2"
      />

      {/* Right scale pan */}
      <path {...STROKE_PROPS} stroke="var(--color-success, #10b981)" d="M74 34 L70 48 H84 L80 34" />
      <path
        d="M69 48 C69 54 85 54 85 48 Z"
        fill="var(--color-success, #10b981)"
        opacity="0.2"
      />

      {/* Verified Success Badge */}
      <circle cx="48" cy="74" r="11" fill="var(--color-success, #10b981)" />
      <path
        d="M43 74 L46.5 77.5 L53.5 70.5"
        stroke="var(--color-surface, #ffffff)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
