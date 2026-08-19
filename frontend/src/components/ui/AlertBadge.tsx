"use client";

import { useAlertBadgeCount } from "@/features/alerts/use-alert-center";

export function AlertBadge() {
  const count = useAlertBadgeCount();

  if (count === 0) return null;

  return (
    <div className="absolute top-0 right-0 -mr-2 -mt-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-danger border border-surface shadow-sm">
      {count > 99 ? "99+" : count}
    </div>
  );
}
