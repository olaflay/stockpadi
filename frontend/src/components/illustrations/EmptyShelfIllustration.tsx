import { ILLUSTRATION_VIEWBOX } from "./shared";

export function EmptyShelfIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden="true">
      <rect x="5" y="5" width="86" height="86" rx="27" fill="var(--color-surface-container-high)" />
      <rect x="20" y="23" width="56" height="53" rx="5" fill="currentColor"/>
      <path fill="var(--color-surface-container-high)" d="M27 30h42v16H27zm0 23h42v16H27z"/>
      <rect x="32" y="35" width="12" height="11" rx="2" fill="var(--color-brand-accent)"/>
      <rect x="47" y="31" width="13" height="15" rx="2" fill="var(--color-brand-accent)" opacity=".65"/>
    </svg>
  );
}
