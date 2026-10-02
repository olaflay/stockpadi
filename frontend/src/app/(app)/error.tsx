"use deliberate client";
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { getBrandingConfig } from "@/config/branding";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: ErrorProps) {
  const branding = getBrandingConfig();

  useEffect(() => {
    // Log crash to console in development and monitoring in production
    console.error("[AppCrash]", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-[var(--color-danger-container)] text-[var(--color-danger)] flex items-center justify-center mb-4">
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
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <h1 className="text-[var(--font-size-title-lg)] font-bold text-[var(--color-on-surface)] mb-2">
        Something unexpected happened
      </h1>
      <p className="text-[var(--font-size-body)] text-[var(--color-on-surface-muted)] max-w-sm mb-6">
        Your {branding.businessName} data is safe and offline records are preserved in local storage.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={() => reset()}
          className="w-full min-h-[48px] px-6 rounded-[var(--radius-control)] bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-contrast)] font-medium transition-transform active:scale-[0.98] shadow-sm flex items-center justify-center"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="w-full min-h-[48px] px-6 rounded-[var(--radius-control)] bg-[var(--color-surface-container)] text-[var(--color-on-surface)] font-medium transition-colors hover:bg-[var(--color-surface-container-high)] flex items-center justify-center"
        >
          Go to Dashboard
        </Link>
      </div>

      {error.digest && (
        <p className="mt-8 text-[var(--font-size-caption)] text-[var(--color-on-surface-muted)] font-mono">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
