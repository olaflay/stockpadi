import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** "Works without network" — A phone running smoothly offline with local ledger security. */
export function OfflineIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft background disc */}
      <circle cx="48" cy="48" r="44" fill="currentColor" opacity="0.06" />

      {/* Modern phone body */}
      <rect
        x="32"
        y="18"
        width="32"
        height="60"
        rx="8"
        fill="var(--color-surface, #ffffff)"
        stroke="currentColor"
        strokeWidth="2.5"
      />

      {/* Top phone speaker notch & screen line */}
      <rect x="42" y="24" width="12" height="2.5" rx="1.25" fill="currentColor" opacity="0.4" />
      <rect x="36" y="32" width="24" height="34" rx="4" fill="currentColor" opacity="0.06" />

      {/* Verified local data checkmark inside screen */}
      <circle cx="48" cy="48" r="8" fill="var(--color-brand-accent, #0f766e)" opacity="0.15" />
      <path
        d="M44 48 L46.5 50.5 L52 45"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Floating Offline / Paper Plane badge */}
      <g transform="translate(56, 20)">
        <circle cx="12" cy="12" r="12" fill="var(--color-surface, #ffffff)" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="10" fill="var(--color-brand-accent, #0f766e)" />
        <path
          d="M6 12 L17 7 L13 17 L10.5 13.5 Z"
          fill="var(--color-surface, #ffffff)"
        />
      </g>
    </svg>
  );
}
