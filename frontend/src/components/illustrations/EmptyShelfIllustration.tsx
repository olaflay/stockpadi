import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** "Your shelf is empty" — A modern, elegant retail shelf waiting for its first stock item. */
export function EmptyShelfIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft ambient background disc */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.06" />
      <circle cx="48" cy="48" r="32" fill="currentColor" opacity="0.04" />

      {/* Modern retail shelf frame */}
      {/* Top shelf tier */}
      <rect x="20" y="32" width="56" height="4" rx="2" fill="currentColor" opacity="0.8" />
      {/* Bottom shelf tier */}
      <rect x="20" y="60" width="56" height="4" rx="2" fill="currentColor" opacity="0.8" />

      {/* Upright shelf posts with rounded caps */}
      <path {...STROKE_PROPS} d="M26 22 V76" />
      <path {...STROKE_PROPS} d="M70 22 V76" />

      {/* Subtle product placement shadow silhouettes */}
      <rect x="30" y="44" width="14" height="16" rx="2" fill="currentColor" opacity="0.12" />
      <rect x="52" y="48" width="14" height="12" rx="2" fill="currentColor" opacity="0.12" />

      {/* Plus badge inviting item addition */}
      <circle cx="48" cy="34" r="10" fill="var(--color-surface, #ffffff)" stroke="currentColor" strokeWidth="2.5" />
      <path {...STROKE_PROPS} strokeWidth="2.5" d="M48 29 V39 M43 34 H53" />
    </svg>
  );
}
