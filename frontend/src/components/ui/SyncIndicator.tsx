"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems, drainOutbox } from "@/features/sync/drain-outbox";

/**
 * Sync status indicator with manual "Force Sync Now" control.
 * Failed state takes priority over pending. Shows live diagnostic info
 * on tap: number of queued items, last sync status.
 */
export function SyncIndicator() {
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleForceSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await drainOutbox();
    } finally {
      setIsSyncing(false);
    }
  };

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

  if (pendingCount === 0) {
    return (
      <button
        type="button"
        onClick={handleForceSync}
        disabled={isSyncing}
        role="status"
        aria-label="All changes backed up. Tap to force sync."
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] px-2 py-0.5 text-[length:var(--font-size-caption)] text-on-surface-muted hover:bg-surface-container transition-colors disabled:opacity-70"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
        Synced
        <RefreshCw size={10} className={isSyncing ? "animate-spin" : ""} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleForceSync}
      disabled={isSyncing}
      role="status"
      aria-label={`${pendingCount} changes waiting to sync. Tap to force sync now.`}
      className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted hover:bg-surface-container-high/80 transition-colors disabled:opacity-70"
    >
      <span
        aria-hidden
        className="h-2 w-2 animate-pulse rounded-full"
        style={{ background: "var(--color-brand-accent)" }}
      />
      {isSyncing
        ? "Syncing…"
        : `${pendingCount} pending · Tap to sync`}
      <RefreshCw size={10} className={isSyncing ? "animate-spin" : ""} />
    </button>
  );
}
