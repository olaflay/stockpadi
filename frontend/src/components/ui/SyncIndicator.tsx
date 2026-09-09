import { useState } from "react";
import { RefreshCw, Zap } from "lucide-react";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems, drainOutbox } from "@/features/sync/drain-outbox";
import { useToast } from "@/components/ui/Toast";
import { useOnlineStatus } from "@/lib/use-online-status";
import { db } from "@/lib/db";

/**
 * Sync status indicator with manual "Force Sync Now" control.
 * In compact mode (for headers/mobile toolbars), renders as a slim icon/counter pill
 * so screen titles ("Sell", "Products") never get squished or truncated.
 * Supports variant="contrast" for dark/brand-accent headers.
 */
export function SyncIndicator({
  compact = false,
  variant = "default",
}: {
  compact?: boolean;
  variant?: "default" | "contrast";
} = {}) {
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();
  const isOnline = useOnlineStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showToast } = useToast();
  const isContrast = variant === "contrast";

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
        showToast(`${result.drained} backed up, ${result.pendingRemaining} still uploading...`, "neutral");
      } else {
        showToast(`${result.pendingRemaining} changes waiting to upload.`, "neutral");
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
    try {
      await retryFailedOutboxItems();
      const firstFailed = await db.outbox.where("status").equals("failed").first();
      if (firstFailed?.lastError?.includes("verification") || firstFailed?.lastError?.includes("approved")) {
        showToast("Account pending verification: products and sales are saved locally and will sync once approved.", "warning");
      } else if (compact) {
        showToast(`Retried sync for ${failedCount} change${failedCount === 1 ? "" : "s"}.`, "neutral");
      }
    } finally {
      setIsRetrying(false);
    }
  };

  if (failedCount > 0) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={isRetrying}
            role="status"
            title={`${failedCount} changes didn't sync · Tap to retry`}
            aria-label={`${failedCount} changes didn't sync · Tap to retry`}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold disabled:opacity-70 transition-transform active:scale-95 ${
              isContrast ? "bg-red-500 text-white" : "bg-danger-container text-on-danger-container"
            }`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full animate-pulse bg-white" />
            <span className="font-number leading-none">{isRetrying ? "…" : failedCount}</span>
          </button>
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={isRetrying}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors active:scale-95 disabled:opacity-70 ${
              isContrast ? "bg-white/20 text-white hover:bg-white/30" : "bg-danger/10 text-danger hover:bg-danger/20"
            }`}
          >
            <RefreshCw size={11} className={isRetrying ? "animate-spin" : ""} />
            <span>Sync now</span>
          </button>
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-2">
        <span
          role="status"
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-inline)] bg-danger-container px-3 text-[length:var(--font-size-caption)] text-on-danger-container"
        >
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: "var(--color-danger)" }} />
          <span>{failedCount} {failedCount === 1 ? "change" : "changes"} didn&apos;t sync</span>
        </span>
        <button
          type="button"
          onClick={handleRetryFailed}
          disabled={isRetrying}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-[var(--radius-inline)] bg-danger px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-white hover:bg-danger/90 transition-colors active:scale-95 disabled:opacity-70"
        >
          <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
          <span>{isRetrying ? "Retrying…" : "Sync now"}</span>
        </button>
      </div>
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
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-transform active:scale-95 ${
            isContrast ? "bg-white/15 text-white" : "bg-surface-container-high text-on-surface-muted"
          }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: isContrast ? "#86efac" : "var(--color-brand-accent)" }}
          />
          <span className="font-number leading-none">{pendingCount}</span>
          <Zap size={11} className={isContrast ? "text-emerald-300" : "text-brand-accent opacity-80"} />
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
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs transition-colors disabled:opacity-70 ${
            isContrast
              ? "text-brand-accent-contrast/90 hover:text-white hover:bg-white/10"
              : "text-on-surface-muted hover:bg-surface-container"
          }`}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: isContrast ? "#86efac" : "var(--color-success)" }}
          />
          <RefreshCw size={11} className={isSyncing ? "animate-spin text-white" : isContrast ? "text-white/80" : "opacity-60"} />
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
      <div className="inline-flex items-center gap-1.5">
        <span
          role="status"
          title={`${pendingCount} changes waiting to sync`}
          aria-label={`${pendingCount} changes waiting to sync`}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${
            isContrast ? "bg-white/15 text-white" : "bg-surface-container-high text-on-surface-muted"
          }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ background: isContrast ? "#86efac" : "var(--color-brand-accent)" }}
          />
          <span className="font-number leading-none">{isSyncing ? "…" : pendingCount}</span>
        </span>
        <button
          type="button"
          onClick={handleForceSync}
          disabled={isSyncing}
          role="button"
          title="Tap to sync now"
          aria-label="Tap to sync now"
          className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors active:scale-95 disabled:opacity-70 ${
            isContrast
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20"
          }`}
        >
          <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
          <span>Sync now</span>
        </button>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span
        role="status"
        aria-label={`${pendingCount} changes waiting to sync`}
        className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
      >
        <span
          aria-hidden
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span>{pendingCount} {pendingCount === 1 ? "action" : "actions"} pending</span>
      </span>
      <button
        type="button"
        onClick={handleForceSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] bg-brand-accent px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-white hover:bg-brand-accent/90 transition-colors active:scale-95 disabled:opacity-70"
      >
        <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
        <span>{isSyncing ? "Syncing…" : "Sync now"}</span>
      </button>
    </div>
  );
}
