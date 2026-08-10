"use client";

import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Persistent, non-blocking. Never a modal, never interrupts the task the
 * person is mid-way through. See .agents/skills/scaffold-new-screen.md.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="w-full bg-warning-container px-4 py-2 text-center text-[length:var(--font-size-label)] text-on-warning-container"
    >
      You&apos;re offline. Sales and changes are saved on this device and will sync when you&apos;re back online.
    </div>
  );
}
