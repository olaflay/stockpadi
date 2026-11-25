import { ILLUSTRATION_VIEWBOX } from "./shared";

export function OfflineIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden="true">
      <rect x="5" y="5" width="86" height="86" rx="27" fill="var(--color-surface-container-high)" />
      <rect x="27" y="14" width="42" height="68" rx="10" fill="currentColor"/>
      <rect x="32" y="23" width="32" height="50" rx="5" fill="var(--color-surface-container-high)"/>
      <circle cx="59" cy="55" r="15" fill="var(--color-brand-accent)"/>
      <path fill="var(--color-brand-accent-contrast)" d="m50 55 6 6 11-12-3-3-8 9-3-3z"/>
    </svg>
  );
}
