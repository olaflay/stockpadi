"use client";

import type { SVGProps } from "react";

interface NairaIconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width/height in px. Defaults to 14 like the blueprint spec. */
  size?: number;
}

/**
 * Inline naira glyph for mission-critical receipt and header displays where a
 * missing font codepoint would render as tofu on low-end Android. Drawn as an
 * "N" with a double horizontal bar so it reads as ₦ at any size and never
 * depends on the device font. Blueprint §9.7.
 */
export function NairaIcon({ size = 14, ...props }: NairaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M4 4v16" />
      <path d="M20 4v16" />
      <path d="M4 4l16 16" />
      <path d="M2 9.5h20" />
      <path d="M2 14.5h20" />
    </svg>
  );
}