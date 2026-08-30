import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Registration step — A brand-new store opening with an ownership access key. */
export function RegisterIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft ambient background glow */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />

      {/* Main shop building structure — uses surface-container-high so it never turns black in dark mode */}
      <rect
        x="22"
        y="38"
        width="52"
        height="38"
        rx="4"
        fill="var(--color-surface-container-high)"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      {/* Modern angled roof canopy */}
      <path
        d="M16 38 L48 20 L80 38 Z"
        fill="currentColor"
        opacity="0.14"
      />
      <path {...STROKE_PROPS} stroke="currentColor" d="M16 38 L48 20 L80 38" />

      {/* Display windows */}
      <rect x="28" y="46" width="12" height="12" rx="2" fill="currentColor" opacity="0.12" />
      <rect x="56" y="46" width="12" height="12" rx="2" fill="currentColor" opacity="0.12" />

      {/* Glass store door */}
      <rect x="42" y="52" width="12" height="24" rx="2" fill="currentColor" opacity="0.2" />
      <circle cx="51" cy="64" r="1.5" fill="currentColor" />

      {/* Floating Key of Ownership */}
      <g transform="translate(62, 18)">
        <circle cx="10" cy="10" r="12" fill="var(--color-surface-container-high)" stroke="currentColor" strokeWidth="2" />
        <circle cx="7" cy="8" r="4" fill="none" stroke="var(--color-brand-accent)" strokeWidth="2" />
        <path d="M10 11 L16 17 L15 18 M13 14 L15 16" stroke="var(--color-brand-accent)" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}
