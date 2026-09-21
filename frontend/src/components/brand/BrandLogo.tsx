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
 * Precision geometric OjàPadi brand mark.
 * Features the Infinite Market Loop ("O") embodying unbroken offline trade continuity,
 * paired with the illuminated sunburst trade accent representing the authentic "Ojà" tone mark.
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
      aria-label="OjàPadi Mark"
    >
      {/* Background squircle with token elevation */}
      <rect width="48" height="48" rx="12" fill="currentColor" fillOpacity="0.12" />
      
      {/* Primary Market Loop ("O") */}
      <path
        d="M24 14C17.925 14 13 18.925 13 25C13 31.075 17.925 36 24 36C30.075 36 35 31.075 35 25C35 21.6 33.5 18.6 31.2 16.5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Center Trade Equilibrium Node */}
      <circle cx="24" cy="25" r="2.2" fill="currentColor" />
      {/* Sunburst Tone Accent (Symbolizing 'Ojà' Tone Mark) */}
      <circle cx="33" cy="14" r="2.2" fill="currentColor" />
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
            Ojà<span className="text-brand-accent">Padi</span>
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
