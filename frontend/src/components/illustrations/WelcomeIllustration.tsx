import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Onboarding step 1 — Welcome & trust moment with verified storefront. */
export function WelcomeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft ambient background disc */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.06" />

      {/* Main shop building structure */}
      <rect
        x="24"
        y="42"
        width="48"
        height="32"
        rx="4"
        fill="var(--color-surface, #ffffff)"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      {/* Modern shop awning */}
      <path
        d="M20 42 C20 42 22 26 48 26 C74 26 76 42 76 42 Z"
        fill="currentColor"
        opacity="0.12"
      />
      <path {...STROKE_PROPS} d="M18 42 L24 28 H72 L78 42 Z" />

      {/* Scalloped awning bottom */}
      <path
        {...STROKE_PROPS}
        d="M18 42 C21 46 27 46 30 42 C33 46 39 46 42 42 C45 46 51 46 54 42 C57 46 63 46 66 42 C69 46 75 46 78 42"
      />

      {/* Store entrance door */}
      <rect x="42" y="52" width="12" height="22" rx="2" fill="currentColor" opacity="0.15" />
      <circle cx="51" cy="63" r="1.5" fill="currentColor" />

      {/* Floating Trust Verification Shield */}
      <g transform="translate(62, 54)">
        <circle cx="10" cy="10" r="12" fill="var(--color-surface, #ffffff)" stroke="currentColor" strokeWidth="2" />
        <circle cx="10" cy="10" r="10" fill="var(--color-success, #10b981)" />
        <path
          d="M6.5 10 L8.8 12.5 L13.5 7.5"
          stroke="var(--color-surface, #ffffff)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
