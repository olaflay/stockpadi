import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Registration step — a new store opening with a key handoff. */
export function RegisterIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      {/* Store building */}
      <rect {...STROKE_PROPS} x="22" y="40" width="52" height="34" rx="2" />
      {/* Roof/awning */}
      <path {...STROKE_PROPS} d="M18 40 L48 22 L78 40" />
      {/* Door */}
      <rect {...STROKE_PROPS} x="41" y="56" width="14" height="18" rx="1" />
      {/* Door handle */}
      <circle cx="52" cy="65" r="2" fill="currentColor" opacity="0.6" />
      {/* Window left */}
      <rect {...STROKE_PROPS} x="26" y="47" width="12" height="10" rx="1" />
      {/* Window right */}
      <rect {...STROKE_PROPS} x="58" y="47" width="12" height="10" rx="1" />
      {/* Key (floating, indicating ownership/access) */}
      <circle {...STROKE_PROPS} cx="72" cy="28" r="7" />
      <path {...STROKE_PROPS} d="M77 33 L84 40 L82 42 L80 40 L78 42 L76 40" />
    </svg>
  );
}
