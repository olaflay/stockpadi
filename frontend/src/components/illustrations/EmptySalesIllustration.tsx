import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** "No sales yet today" — a blank clipboard/ledger waiting for its first entry. */
export function EmptySalesIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      <rect {...STROKE_PROPS} x="28" y="22" width="40" height="54" rx="4" />
      <rect {...STROKE_PROPS} x="40" y="18" width="16" height="8" rx="2" fill="var(--color-surface)" />
      <line {...STROKE_PROPS} x1="36" y1="40" x2="60" y2="40" opacity="0.5" />
      <line {...STROKE_PROPS} x1="36" y1="50" x2="60" y2="50" opacity="0.5" />
      <line {...STROKE_PROPS} x1="36" y1="60" x2="52" y2="60" opacity="0.5" />
    </svg>
  );
}
