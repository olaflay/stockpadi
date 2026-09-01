"use client";

import { useOnlineStatus } from "@/lib/use-online-status";
import { usePendingSyncCount } from "@/lib/use-pending-sync-count";

// A soft heads-up well before any practical ceiling: at this many unsynced
// items the person should reach connectivity soon, but nothing stops working.
const UNSYNCED_HEADS_UP = 250;

/**
 * Persistent, non-blocking. Never a modal, never interrupts the task the
 * person is mid-way through. See .agents/skills/scaffold-new-screen.md.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const pendingCount = usePendingSyncCount();

  if (isOnline) return null;

  const message =
    pendingCount >= UNSYNCED_HEADS_UP
      ? `You're offline. ${pendingCount} changes are saved on this device and will sync when you're back online.`
      : "You're offline. Sales and changes are saved on this device and will sync when you're back online.";

  return (
    <div
      role="status"
      className="w-full bg-warning-container px-4 py-2 text-center text-[length:var(--font-size-label)] text-on-warning-container"
    >
      {message}
    </div>
  );
}
