import { ILLUSTRATION_VIEWBOX, STROKE_PROPS } from "./shared";

/** Sale complete — The receipt hero moment with clean serrated slip and verified payment seal. */
export function ReceiptIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} fill="none" aria-hidden>
      {/* Soft emerald background glow */}
      <circle cx="48" cy="48" r="44" fill="var(--color-success)" opacity="0.1" />

      {/* Main receipt slip with modern serrated bottom — uses surface-container-high so it pops in dark mode */}
      <path
        d="M28 16 H68 V76 L63 72 L58 76 L53 72 L48 76 L43 72 L38 76 L33 72 L28 76 Z"
        fill="var(--color-surface-container-high)"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Clean receipt content lines */}
      <rect x="36" y="26" width="24" height="4" rx="2" fill="currentColor" opacity="0.75" />
      <rect x="36" y="36" width="24" height="2" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="36" y="42" width="18" height="2" rx="1" fill="currentColor" opacity="0.25" />

      {/* Dashed divider */}
      <path {...STROKE_PROPS} stroke="currentColor" strokeDasharray="3 3" d="M34 50 H62" opacity="0.4" />

      {/* Emerald Paid Success Seal */}
      <circle cx="48" cy="62" r="9" fill="var(--color-success)" />
      <path
        d="M44 62 L46.5 64.5 L52 59"
        stroke="var(--color-on-success)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
