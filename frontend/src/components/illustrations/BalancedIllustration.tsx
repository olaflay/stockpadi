import { ILLUSTRATION_VIEWBOX } from "./shared";

export function BalancedIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox={ILLUSTRATION_VIEWBOX} className={className} aria-hidden="true">
      <rect x="5" y="5" width="86" height="86" rx="27" fill="var(--color-surface-container-high)" />
      <path fill="var(--color-success)" d="M44 24h8v43h17v8H27v-8h17zM18 31h60v6H18z"/>
      <path fill="var(--color-success)" opacity=".72" d="M25 35 13 57a13 13 0 0 0 24 0zm46 0L59 57a13 13 0 0 0 24 0z"/>
    </svg>
  );
}
