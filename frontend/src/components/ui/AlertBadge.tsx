"use client";

import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";

export interface BadgeProps {
  count?: number;
  className?: string;
  tone?: "alert" | "neutral";
}

/**
 * Standardized High-Contrast Notification & Count Badge.
 * Rules:
 * - Light Mode: Darker background, light text.
 * - Dark Mode: Lighter background, dark text.
 */
export function CountBadge({ count, className = "", tone = "neutral" }: BadgeProps) {
  if (count === undefined || count === 0) return null;
  const displayCount = count > 99 ? "99+" : count;

  const toneClass =
    tone === "alert"
      ? "bg-badge-alert-bg text-badge-alert-fg"
      : "bg-badge-bg text-badge-fg";

  return (
    <span
      aria-label={`${count} items`}
      className={`inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold border border-surface shadow-sm ${toneClass} ${className}`}
    >
      {displayCount}
    </span>
  );
}

export function AlertBadge({ count: propCount, className = "" }: { count?: number; className?: string }) {
  const hookCount = useAlertBadgeCount();
  const count = propCount ?? hookCount;

  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} unread notifications`}
      className={`absolute top-0 right-0 -mr-2 -mt-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-badge-alert-bg px-1 text-[10px] font-bold text-badge-alert-fg border border-surface shadow-sm ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
