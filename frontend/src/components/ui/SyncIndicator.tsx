import { useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems, drainOutbox } from "@/features/sync/drain-outbox";
import { useToast } from "@/components/ui/Toast";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Sync status indicator with manual "Force Sync Now" control.
 * In compact mode (for headers/mobile toolbars), renders as a slim icon/counter pill
 * so screen titles ("Sell", "Products") never get squished or truncated.
 */
export function SyncIndicator({ compact = false }: { compact?: boolean } = {}) {
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();
  const isOnline = useOnlineStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showToast } = useToast();

  const handleForceSync = async () => {
    if (isSyncing) return;
    if (!isOnline) {
      showToast(
        pendingCount > 0
          ? `You're offline. ${pendingCount} change${pendingCount === 1 ? "" : "s"} saved locally on this device. Reconnect to upload.`
          : "You're currently offline. Local ledger is running.",
        "neutral"
      );
      return;
    }
    setIsSyncing(true);
    if (compact && pendingCount > 0) {
      showToast(`Backing up ${pendingCount} change${pendingCount === 1 ? "" : "s"} to cloud…`, "neutral");
    }
    try {
      const result = await drainOutbox();
      if (result.pendingRemaining === 0) {
        showToast("Sync complete! All changes backed up.", "success");
      } else if (result.drained > 0) {
        showToast(`${result.drained} backed up, ${result.pendingRemaining} still processing…`, "neutral");
      } else {
        showToast(`${result.pendingRemaining} changes pending server verification.`, "neutral");
      }
    } catch {
      showToast("Could not complete cloud sync. Check connection and retry.", "warning");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    if (compact) {
      showToast(`Retrying ${failedCount} unsynced change${failedCount === 1 ? "" : "s"}…`, "danger");
    }
    try {
      await retryFailedOutboxItems();
    } finally {
      setIsRetrying(false);
    }
  };

  if (failedCount > 0) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={handleRetryFailed}
          disabled={isRetrying}
          role="status"
          title={`${failedCount} changes didn't sync · Tap to retry`}
          aria-label={`${failedCount} changes didn't sync · Tap to retry`}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-full bg-danger-container px-2.5 py-1 text-xs font-semibold text-on-danger-container disabled:opacity-70 transition-transform active:scale-95"
        >
          <span aria-hidden className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--color-danger)" }} />
          <span className="font-number leading-none">{isRetrying ? "…" : failedCount}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleRetryFailed}
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

  // Offline state with pending items — calm, affirmative copy
  if (!isOnline && pendingCount > 0) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={() =>
            showToast(
              `You're offline. ${pendingCount} change${pendingCount === 1 ? "" : "s"} saved locally on this device.`,
              "neutral"
            )
          }
          role="status"
          title={`${pendingCount} changes saved on this device (offline)`}
          aria-label={`${pendingCount} changes saved on this device (offline)`}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-muted transition-transform active:scale-95"
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--color-brand-accent)" }}
          />
          <span className="font-number leading-none">{pendingCount}</span>
          <Zap size={11} className="text-brand-accent opacity-80" />
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() =>
          showToast(
            `You're offline. ${pendingCount} change${pendingCount === 1 ? "" : "s"} saved locally on this device.`,
            "neutral"
          )
        }
        role="status"
        className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
      >
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span>{pendingCount} saved on device · Offline</span>
      </button>
    );
  }

  if (pendingCount === 0) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={handleForceSync}
          disabled={isSyncing}
          role="status"
          title="All changes backed up. Tap to force sync."
          aria-label="All changes backed up. Tap to force sync."
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1 rounded-full px-2 py-1 text-xs text-on-surface-muted hover:bg-surface-container transition-colors disabled:opacity-70"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
          <RefreshCw size={11} className={isSyncing ? "animate-spin text-brand-accent" : "opacity-60"} />
        </button>
      );
    }

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

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleForceSync}
        disabled={isSyncing}
        role="status"
        title={`${pendingCount} changes waiting to sync. Tap to sync now.`}
        aria-label={`${pendingCount} changes waiting to sync. Tap to sync now.`}
        className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface-muted hover:bg-surface-container-high/80 transition-transform active:scale-95 disabled:opacity-70"
      >
        <span
          aria-hidden
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span className="font-number leading-none">{isSyncing ? "…" : pendingCount}</span>
        <RefreshCw size={11} className={isSyncing ? "animate-spin" : "opacity-60"} />
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
