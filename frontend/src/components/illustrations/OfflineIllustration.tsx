import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** The "works without network" / airplane-mode moment — a phone still working, plus a paper-plane. */
export function OfflineIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      <rect {...STROKE_PROPS} x="34" y="20" width="28" height="52" rx="5" />
      <line {...STROKE_PROPS} x1="42" y1="62" x2="54" y2="62" />
      <path {...STROKE_PROPS} d="M40 40 L48 34 L56 40 L48 48 Z" />
      <circle cx="66" cy="30" r="13" fill="var(--color-surface)" stroke="currentColor" strokeWidth="3" />
      <path {...STROKE_PROPS} strokeWidth="2.5" d="M60 31 L72 27 L66 33 L68 39 Z" />
    </svg>
  );
}
