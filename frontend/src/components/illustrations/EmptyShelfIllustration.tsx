import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** "Your shelf is empty" — an empty shelf, first-run catalog moment. */
export function EmptyShelfIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      <line {...STROKE_PROPS} x1="22" y1="32" x2="74" y2="32" />
      <line {...STROKE_PROPS} x1="22" y1="58" x2="74" y2="58" />
      <line {...STROKE_PROPS} x1="26" y1="32" x2="26" y2="74" />
      <line {...STROKE_PROPS} x1="70" y1="32" x2="70" y2="74" />
      <path {...STROKE_PROPS} strokeDasharray="6 6" d="M36 46 H60" opacity="0.6" />
    </svg>
  );
}
