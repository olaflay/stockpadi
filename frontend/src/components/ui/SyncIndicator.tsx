import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems, drainOutbox } from "@/features/sync/drain-outbox";
import { useToast } from "@/components/ui/Toast";
import { useOnlineStatus } from "@/lib/use-online-status";
import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import { useLiveQuery } from "dexie-react-hooks";
import { preloadSessionData } from "@/features/sync/preload-session-data";
import { useSyncSafety } from "@/lib/use-sync-safety";
import { setSyncRuntimePhase, useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

const CLOUD_HEALTH_MAX_AGE_MS = 90_000;

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
  const router = useRouter();
  const runtimePhase = useSyncRuntimePhase();
  const pullDiagnostics = useLiveQuery(async () => {
    const businessId = await getLocalBusinessId();
    return businessId ? db.syncDiagnostics.where("businessId").equals(businessId).toArray() : [];
  }, [], []);
  const pullFailure = pullDiagnostics?.some((diagnostic) => !diagnostic.success) ?? false;
  const pullComplete = pullDiagnostics?.some((diagnostic) => diagnostic.entity === "session" && diagnostic.success) ?? false;
  const pullState = useLiveQuery(async () => {
    const businessId = await getLocalBusinessId();
    return businessId ? db.syncPullState.get(`${businessId}:session`) : undefined;
  }, [], undefined);
  const syncSafety = useSyncSafety();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showToast } = useToast();
  const isContrast = variant === "contrast";
  const cloudHealthy = Boolean(
    isOnline &&
    pullComplete &&
    !pullFailure &&
    pullState?.lastCompletePullAt &&
    pullState.lastServerContactAt &&
    Date.now() - new Date(pullState.lastServerContactAt).getTime() <= CLOUD_HEALTH_MAX_AGE_MS
  );
  const openDiagnostics = () => router.push("/settings/sync-health");
  const phaseLabel = runtimePhase === "uploading" ? "↑ Uploading" : runtimePhase === "downloading" ? "↓ Downloading" : "↕ Syncing";

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
    setSyncRuntimePhase("syncing");
    if (compact && pendingCount > 0) {
      showToast(`Backing up ${pendingCount} change${pendingCount === 1 ? "" : "s"} to cloud…`, "neutral");
    }
    try {
      const result = await drainOutbox();
      const pullResult = await preloadSessionData(true);
      if (result.pendingRemaining === 0 && pullResult.fullySynced) {
        showToast("Sync complete! All changes backed up.", "success");
      } else if (result.pendingRemaining === 0 && !pullResult.fullySynced) {
        showToast("Changes are backed up, but some cloud data could not refresh.", "warning");
      } else if (result.drained > 0) {
        showToast(`${result.drained} backed up, ${result.pendingRemaining} still uploading...`, "neutral");
      } else {
        showToast(`${result.pendingRemaining} changes waiting to upload.`, "neutral");
      }
    } catch {
      showToast("Could not complete cloud sync. Check connection and retry.", "warning");
    } finally {
      setSyncRuntimePhase("idle");
      setIsSyncing(false);
    }
  };

  const handleRetryFailed = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await retryFailedOutboxItems();
      const firstFailed = await db.outbox.where("status").equals("failed").first();
      const firstBlocked = await db.outbox.where("status").equals("blocked").first();
      if (["ACCOUNT_NOT_APPROVED", "BUSINESS_UNAVAILABLE"].includes(firstFailed?.errorCode ?? "") || ["ACCOUNT_NOT_APPROVED", "BUSINESS_UNAVAILABLE"].includes(firstBlocked?.errorCode ?? "")) {
        showToast("Account pending verification: products and sales are saved locally and will sync once approved.", "warning");
      } else if (compact) {
        showToast(`Retried sync for ${failedCount} change${failedCount === 1 ? "" : "s"}.`, "neutral");
      }
    } finally {
      setIsRetrying(false);
    }
  };

  if (failedCount === 0 && syncSafety.required) {
    return (
      <button
        type="button"
        onClick={openDiagnostics}
        disabled={isSyncing || !isOnline}
        role="status"
        title="Open Sync Diagnostics"
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-60 ${isContrast ? "bg-amber-400 text-black" : "bg-warning-container text-on-warning-container"}`}
      >
        <AlertTriangle size={13} aria-hidden />
        {compact ? `${syncSafety.queueCount} sync required` : "Sync required"}
      </button>
    );
  }

  if (failedCount > 0) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={openDiagnostics}
            disabled={isRetrying}
            role="status"
            title="Open Sync Diagnostics"
            aria-label="Open Sync Diagnostics"
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
          onClick={openDiagnostics}
          role="status"
          title="Open Sync Diagnostics"
          aria-label="Open Sync Diagnostics"
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
        onClick={openDiagnostics}
        role="status"
        className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
      >
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span>Offline — changes saved</span>
      </button>
    );
  }

  if (pendingCount === 0 && pullFailure) {
    if (compact) {
      return (
        <button type="button" onClick={openDiagnostics} disabled={isSyncing} role="status" title="Open Sync Diagnostics" aria-label="Open Sync Diagnostics" className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs ${isContrast ? "text-amber-200 hover:bg-white/10" : "text-warning"}`}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span>Sync issue</span>
        </button>
      );
    }
    return (
      <button type="button" onClick={openDiagnostics} disabled={isSyncing} role="status" aria-label="Open Sync Diagnostics" className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-warning-container px-3 py-1 text-[length:var(--font-size-caption)] text-on-warning-container transition-colors hover:opacity-90">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
        Sync issue
      </button>
    );
  }

  if (pendingCount === 0 && (runtimePhase !== "idle" || !cloudHealthy)) {
    return (
      <button type="button" onClick={openDiagnostics} disabled={isSyncing} role="status" aria-label="Open Sync Diagnostics" title="Open Sync Diagnostics" className={`inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] px-2 py-0.5 text-[length:var(--font-size-caption)] transition-colors ${isContrast ? "text-white hover:bg-white/10" : "text-on-surface-muted hover:bg-surface-container"}`}>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
        {runtimePhase === "idle" ? "Sync issue" : phaseLabel}
      </button>
    );
  }

  if (pendingCount === 0 && runtimePhase === "idle" && cloudHealthy) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={openDiagnostics}
          disabled={isSyncing}
          role="status"
          title="Open Sync Diagnostics"
          aria-label="Open Sync Diagnostics"
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
        onClick={openDiagnostics}
        disabled={isSyncing}
        role="status"
        aria-label="Open Sync Diagnostics"
        title="Open Sync Diagnostics"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] px-2 py-0.5 text-[length:var(--font-size-caption)] text-on-surface-muted hover:bg-surface-container transition-colors disabled:opacity-70"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
        {pullComplete ? "Synced" : "Sync not checked"}
        <RefreshCw size={10} aria-hidden />
      </button>
    );
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={openDiagnostics}
        role="status"
        title={`${pendingCount} changes waiting to sync. Open Sync Diagnostics.`}
        aria-label={`${pendingCount} changes waiting to sync. Open Sync Diagnostics.`}
        className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
          isContrast ? "bg-white/15 text-white" : "bg-surface-container-high text-on-surface-muted"
        }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ background: isContrast ? "#86efac" : "var(--color-brand-accent)" }}
          />
          <span className="font-number leading-none">{isSyncing ? "…" : pendingCount}</span>
        </button>
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
      <button
        type="button"
        onClick={openDiagnostics}
        role="status"
        title="Open Sync Diagnostics"
        aria-label={`${pendingCount} changes waiting to sync. Open Sync Diagnostics.`}
        className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
      >
        <span
          aria-hidden
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span>{runtimePhase === "idle" ? "↕ Syncing" : phaseLabel} · {pendingCount} pending</span>
      </button>
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
