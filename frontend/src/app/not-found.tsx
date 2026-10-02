import Link from "next/link";
import { getBrandingConfig } from "@/config/branding";

export default function NotFound() {
  const branding = getBrandingConfig();

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-on-surface)] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--color-surface-container)] text-[var(--color-on-surface-muted)] flex items-center justify-center mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      </div>

      <h1 className="text-[var(--font-size-title-lg)] font-bold mb-2">
        Page Not Found
      </h1>
      <p className="text-[var(--font-size-body)] text-[var(--color-on-surface-muted)] max-w-sm mb-6">
        The screen or record you requested does not exist or has been moved.
      </p>

      <Link
        href="/pos"
        className="min-h-[48px] px-6 rounded-[var(--radius-control)] bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-contrast)] font-medium transition-transform active:scale-[0.98] flex items-center justify-center"
      >
        Return to {branding.businessName} POS
      </Link>
    </div>
  );
}
