"use client";

import React from "react";

interface BrandLogoProps {
  variant?: "mark" | "full" | "lockup";
  size?: "sm" | "md" | "lg" | "xl" | number;
  className?: string;
  showTagline?: boolean;
}

const SIZE_MAP = {
  sm: 24,
  md: 32,
  lg: 48,
  xl: 64,
};

/**
 * Precision geometric StockPadi brand mark.
 * Combines the offline ledger foundation with ascending trade momentum (Padi companion arch).
 */
export function BrandMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="StockPadi Mark"
    >
      {/* Background squircle with token elevation */}
      <rect width="48" height="48" rx="12" fill="currentColor" fillOpacity="0.12" />
      
      {/* Precision Interlocking Monoline S-P Vector */}
      <path
        d="M14 18C14 14.6863 16.6863 12 20 12H27C30.866 12 34 15.134 34 19C34 22.866 30.866 26 27 26H21C17.134 26 14 29.134 14 33C14 36.866 17.134 40 21 40H28C31.3137 40 34 37.3137 34 34"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Center Ledger Pivot Dot */}
      <circle cx="24" cy="24" r="2.5" fill="currentColor" />
      {/* Top Growth Node Accent */}
      <circle cx="27" cy="12" r="1.75" fill="currentColor" />
    </svg>
  );
}

export function BrandLogo({
  variant = "full",
  size = "md",
  className = "",
  showTagline = false,
}: BrandLogoProps) {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size];

  if (variant === "mark") {
    return <BrandMark size={pixelSize} className={`text-brand-accent ${className}`} />;
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={pixelSize} className="text-brand-accent" />
      <div className="flex flex-col leading-none">
        <div className="flex items-center">
          <span className="font-extrabold tracking-tight text-on-surface text-[1.15em]">
            Stock<span className="text-brand-accent">Padi</span>
          </span>
          <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-brand-accent" />
        </div>
        {(variant === "lockup" || showTagline) && (
          <span className="mt-0.5 text-[0.6em] font-medium uppercase tracking-widest text-on-surface-muted">
            Offline-First POS
          </span>
        )}
      </div>
    </div>
  );
}
