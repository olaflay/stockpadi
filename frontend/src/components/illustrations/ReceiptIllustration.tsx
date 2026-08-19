import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Sale complete — the receipt moment, shown on the receipt screen's hero block. */
export function ReceiptIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      <path
        {...STROKE_PROPS}
        d="M32 18 H64 V78 L58 72 L52 78 L46 72 L40 78 L34 72 L32 78 Z"
      />
      <line {...STROKE_PROPS} x1="40" y1="32" x2="56" y2="32" opacity="0.5" />
      <line {...STROKE_PROPS} x1="40" y1="40" x2="56" y2="40" opacity="0.5" />
      <circle cx="48" cy="56" r="12" fill="var(--color-success)" opacity="0.15" />
      <path {...STROKE_PROPS} strokeWidth="3" stroke="var(--color-success)" d="M42 56 L46 60 L54 51" />
    </svg>
  );
}
