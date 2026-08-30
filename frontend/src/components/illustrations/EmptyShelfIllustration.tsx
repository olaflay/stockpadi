import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** "Your shelf is empty" — A modern, elegant retail shelf adhering strictly to the design token color system. */
export function EmptyShelfIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft ambient background disc (theme adaptive) */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.08" />
      <circle cx="48" cy="48" r="32" fill="currentColor" opacity="0.05" />

      {/* Upright shelf posts with rounded caps */}
      <path {...STROKE_PROPS} stroke="currentColor" d="M26 22 V76" />
      <path {...STROKE_PROPS} stroke="currentColor" d="M70 22 V76" />

      {/* Modern retail shelf tiers */}
      <rect x="20" y="32" width="56" height="4" rx="2" fill="currentColor" opacity="0.75" />
      <rect x="20" y="60" width="56" height="4" rx="2" fill="currentColor" opacity="0.75" />

      {/* Subtle product placement shadow silhouettes on elevated container */}
      <rect x="30" y="44" width="14" height="16" rx="2" fill="var(--color-surface-container-high)" stroke="currentColor" strokeWidth="1" opacity="0.9" />
      <rect x="52" y="48" width="14" height="12" rx="2" fill="var(--color-surface-container-high)" stroke="currentColor" strokeWidth="1" opacity="0.9" />

      {/* Plus badge inviting item addition */}
      <circle cx="48" cy="34" r="10" fill="var(--color-surface-container-high)" stroke="currentColor" strokeWidth="2" />
      <circle cx="48" cy="34" r="8" fill="var(--color-brand-accent)" />
      <path d="M48 30 V38 M44 34 H52" stroke="var(--color-brand-accent-contrast)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
