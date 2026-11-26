import { ILLUSTRATION_VIEWBOX } from "./shared";

export function RegisterIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden="true">
      <rect x="5" y="5" width="86" height="86" rx="27" fill="var(--color-surface-container-high)" />
      <path fill="var(--color-brand-accent)" d="M22 40h52v38H22z"/>
      <path fill="var(--color-surface-container-high)" d="M27 46h42v29H27z"/>
      <path fill="currentColor" d="M23 23h50l8 17H15z"/>
      <path fill="var(--color-brand-accent-contrast)" opacity=".75" d="M32 23h9l-3 17H27zm23 0h9l5 17H58z"/>
      <rect x="31" y="51" width="16" height="13" rx="2" fill="currentColor"/>
      <path fill="var(--color-brand-accent)" d="M52 52h12v23H52z"/>
    </svg>
  );
}
