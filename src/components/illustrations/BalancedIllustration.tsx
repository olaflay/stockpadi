import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Close day balanced — the nightly reward when counted cash matches expected. */
export function BalancedIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="var(--color-success)" opacity="0.1" />
      <line {...STROKE_PROPS} stroke="var(--color-success)" x1="48" y1="22" x2="48" y2="66" />
      <line {...STROKE_PROPS} stroke="var(--color-success)" x1="26" y1="34" x2="70" y2="34" />
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M20 34 L26 46 L32 34 Z" />
      <path {...STROKE_PROPS} stroke="var(--color-success)" d="M64 34 L70 46 L76 34 Z" />
      <line {...STROKE_PROPS} stroke="var(--color-success)" x1="38" y1="66" x2="58" y2="66" />
      <circle cx="48" cy="76" r="10" fill="var(--color-success)" />
      <path {...STROKE_PROPS} strokeWidth="2.5" stroke="var(--color-surface)" d="M43 76 L47 80 L54 72" />
    </svg>
  );
}
