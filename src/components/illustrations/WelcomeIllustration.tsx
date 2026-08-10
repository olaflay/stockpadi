import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Onboarding step 1 — welcome/trust moment. A storefront with a trust badge. */
export function WelcomeIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden>
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      <path {...STROKE_PROPS} d="M22 42 L26 24 H70 L74 42" />
      <path {...STROKE_PROPS} d="M22 42 V70 H74 V42" />
      <path {...STROKE_PROPS} d="M22 42 Q28 50 34 42 T46 42 T58 42 T70 42 T74 42" />
      <rect {...STROKE_PROPS} x="42" y="54" width="12" height="16" />
      <circle cx="66" cy="64" r="12" fill="var(--color-surface)" stroke="currentColor" strokeWidth="3" />
      <path {...STROKE_PROPS} strokeWidth="3" d="M61 64 L65 68 L71 60" />
    </svg>
  );
}
