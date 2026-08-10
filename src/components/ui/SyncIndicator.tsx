"use client";

import { useState } from "react";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems } from "@/features/sync/drain-outbox";

/**
 * Small, unobtrusive. Failed state takes priority over pending: a change
 * the server rejected needs a tap, one still queued does not. Disappears
 * automatically once there is nothing left to report.
 */
export function SyncIndicator() {
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();
  const [isRetrying, setIsRetrying] = useState(false);

  if (failedCount > 0) {
    return (
      <button
        type="button"
        onClick={async () => {
          setIsRetrying(true);
          try {
            await retryFailedOutboxItems();
          } finally {
            setIsRetrying(false);
          }
        }}
        disabled={isRetrying}
        role="status"
        className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-inline)] bg-danger-container px-3 text-[length:var(--font-size-caption)] text-on-danger-container disabled:opacity-70"
      >
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: "var(--color-danger)" }} />
        {isRetrying
          ? "Retrying…"
          : `${failedCount} ${failedCount === 1 ? "change" : "changes"} didn't sync · Tap to retry`}
      </button>
    );
  }

  if (pendingCount === 0) return null;

  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
    >
      <span
        aria-hidden
        className="h-2 w-2 animate-pulse rounded-full"
        style={{ background: "var(--color-brand-accent)" }}
      />
      Syncing {pendingCount} {pendingCount === 1 ? "change" : "changes"}
    </div>
  );
}
