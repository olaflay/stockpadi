import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { retryFailedOutboxItems } from "@/features/sync/drain-outbox";
import { useToast } from "@/components/ui/Toast";
import { useOnlineStatus } from "@/lib/use-online-status";
import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import { useLiveQuery } from "dexie-react-hooks";
import { runSyncCycle } from "@/features/sync/SyncEngine";
import { useSyncSafety } from "@/lib/use-sync-safety";
import { setSyncRuntimePhase, useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import type { SessionPreloadResult } from "@/features/sync/preload-session-data";

const CLOUD_HEALTH_MAX_AGE_MS = 90_000;
const MANUAL_SYNC_COOLDOWN_MS = 15_000;
let lastManualSyncSuccessAt = 0;

const PULL_DATASET_LABELS: Record<string, string> = {
  business_profile: "business settings",
  branches: "branches",
  categories: "categories",
  products: "products",
  inventory: "stock levels",
  suppliers: "suppliers",
  customers: "customers",
  credit_movements: "customer balances",
  sales: "sales history",
  purchases: "purchases",
  expenses: "expenses",
  session: "cloud data",
};

function pullFailureMessage(result: SessionPreloadResult): string {
  const failure = result.pulls.find((pull) => !pull.success);
  if (!failure) return "Some cloud data is still waiting to refresh. Try again in a moment.";

  const dataset = PULL_DATASET_LABELS[failure.entity] ?? "cloud data";
  switch (failure.error?.code) {
    case "NETWORK_UNAVAILABLE":
      return `The connection dropped while refreshing ${dataset}. Your local changes are safe; reconnect and try again.`;
    case "ACCOUNT_NOT_APPROVED":
    case "BUSINESS_UNAVAILABLE":
      return "Your account is not ready for cloud refresh yet. Local changes remain safe and will retry automatically.";
    case "FORBIDDEN":
      return `Your access could not refresh ${dataset}. Ask the business owner to check your access and assigned branch.`;
    case "PULL_BRANCH_SCOPE_MISMATCH":
      return "Your branch access changed while syncing. Sign in again after the branch assignment is confirmed.";
    default:
      return `The cloud could not refresh ${dataset}. Your local changes are safe; try again when the connection is stable.`;
  }
}

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
  const [now, setNow] = useState<number | null>(null);
  const { showToast } = useToast();
  const isContrast = variant === "contrast";
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const cloudHealthy = Boolean(
    isOnline &&
    pullComplete &&
    !pullFailure &&
    pullState?.lastCompletePullAt &&
    pullState.lastServerContactAt &&
    now !== null && now - new Date(pullState.lastServerContactAt).getTime() <= CLOUD_HEALTH_MAX_AGE_MS
  );
  const openDiagnostics = () => router.push("/settings/sync-health");
  const phaseLabel = runtimePhase === "uploading" ? "↑ Uploading" : runtimePhase === "downloading" ? "↓ Downloading" : "↕ Syncing";

  const handleForceSync = async () => {
    if (isSyncing) {
      showToast("Sync already in progress. Updating in the background…", "neutral");
      return;
    }
    // Repeated-tap protection: If all local changes are already pushed and a full
    // sync completed recently within the cooldown window, reassure the user
    // immediately without spamming Supabase database endpoints.
    const nowTimestamp = Date.now();
    if (pendingCount === 0 && nowTimestamp - lastManualSyncSuccessAt < MANUAL_SYNC_COOLDOWN_MS && !pullFailure) {
      showToast("All changes are already up to date.", "success");
      return;
    }

    setIsSyncing(true);
    setSyncRuntimePhase("syncing");
    if (compact && pendingCount > 0) {
      showToast(`Backing up ${pendingCount} change${pendingCount === 1 ? "" : "s"} to cloud…`, "neutral");
    }
    try {
      // Use the same authoritative cycle as automatic sync. In particular it
      // refreshes a worker's branch assignment before validating pulled stock.
      const cycle = await runSyncCycle("manual");
      if (!cycle) return;
      const { pushResult, pullResult } = cycle;
      const businessId = await getLocalBusinessId();
      const unresolvedPushes = businessId
        ? (await db.outbox.toArray()).filter((item) => item.businessId === businessId && ["failed", "conflict"].includes(item.status)).length
        : 0;
      if (pushResult.pendingRemaining === 0 && unresolvedPushes === 0 && pullResult.fullySynced) {
        lastManualSyncSuccessAt = Date.now();
        showToast("Sync complete! All changes backed up.", "success");
      } else if (pushResult.pendingRemaining === 0 && unresolvedPushes === 0 && !pullResult.fullySynced) {
        showToast(pullFailureMessage(pullResult), "warning");
      } else if (unresolvedPushes > 0) {
        showToast(`${unresolvedPushes} change${unresolvedPushes === 1 ? "" : "s"} needs attention before cloud sync can finish.`, "warning");
      } else if (pushResult.drained > 0) {
        showToast(`${pushResult.drained} backed up, ${pushResult.pendingRemaining} still uploading...`, "neutral");
      } else {
        showToast(`${pushResult.pendingRemaining} changes waiting to upload.`, "neutral");
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
      // Retry marks durable failures pending; the cycle immediately sends
      // them and then pulls cloud state in both directions.
      await runSyncCycle("manual");
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
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={openDiagnostics}
            disabled={isSyncing}
            role="status"
            title="Sync required. Open Sync Diagnostics."
            aria-label="Sync required. Open Sync Diagnostics."
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors active:scale-95 disabled:opacity-60 ${isContrast ? "text-amber-200 hover:bg-white/10" : "text-warning hover:bg-warning-container"}`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
          </button>
          <button
            type="button"
            onClick={handleForceSync}
            disabled={isSyncing}
            title="Sync now"
            aria-label="Sync now"
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-warning-container text-on-warning-container"}`}
          >
            <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
            <span>Sync now</span>
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={openDiagnostics}
        disabled={isSyncing}
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
            isContrast ? "bg-white/15 text-white" : "bg-danger-container text-on-danger-container"
          }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: isContrast ? "#fca5a5" : "var(--color-danger)" }}
          />
          <span className="font-number leading-none">{pendingCount}</span>
          <RefreshCw size={11} className={isContrast ? "text-red-200" : "text-danger opacity-80"} />
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
        <span>Offline · Changes saved</span>
      </button>
    );
  }

  if (pendingCount === 0 && pullFailure) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1">
          <button type="button" onClick={openDiagnostics} disabled={isSyncing} role="status" title="Sync issue. Open Sync Diagnostics." aria-label="Sync issue. Open Sync Diagnostics." className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isContrast ? "text-amber-200 hover:bg-white/10" : "text-warning"}`}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
          </button>
          <button type="button" onClick={handleForceSync} disabled={isSyncing} className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-warning-container text-on-warning-container"}`}>
            <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
            Sync now
          </button>
        </div>
      );
    }
    return (
      <div className="inline-flex items-center gap-2">
        <button type="button" onClick={openDiagnostics} disabled={isSyncing} role="status" aria-label="Open Sync Diagnostics" className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-warning-container px-3 py-1 text-[length:var(--font-size-caption)] text-on-warning-container transition-colors hover:opacity-90">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
          Sync issue
        </button>
        <button type="button" onClick={handleForceSync} disabled={isSyncing} className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-[var(--radius-inline)] bg-warning px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-on-warning disabled:opacity-60">
          <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
          Sync now
        </button>
      </div>
    );
  }

  if (pendingCount === 0 && (runtimePhase !== "idle" || !cloudHealthy)) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={openDiagnostics}
            disabled={isSyncing}
            role="status"
            aria-label={runtimePhase === "idle" ? "Sync issue. Open Sync Diagnostics." : "Sync in progress. Open Sync Diagnostics."}
            title={runtimePhase === "idle" ? "Sync issue. Open Sync Diagnostics." : "Sync in progress. Open Sync Diagnostics."}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${isContrast ? "text-amber-200 hover:bg-white/10" : "text-warning hover:bg-warning-container"}`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${runtimePhase === "idle" ? "bg-warning" : "bg-success animate-pulse"}`} />
          </button>
          {runtimePhase === "idle" && (
            <button type="button" onClick={handleForceSync} disabled={isSyncing} title="Sync now" aria-label="Sync now" className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-surface-container-high text-on-surface"}`}>
              <RefreshCw size={11} />
              <span>Sync now</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-1">
        <button type="button" onClick={openDiagnostics} disabled={isSyncing} role="status" aria-label="Open Sync Diagnostics" title="Open Sync Diagnostics" className={`inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] px-2 py-0.5 text-[length:var(--font-size-caption)] transition-colors ${isContrast ? "text-white hover:bg-white/10" : "text-on-surface-muted hover:bg-surface-container"}`}>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${runtimePhase === "idle" ? "bg-warning" : "bg-success animate-pulse"}`} />
          {runtimePhase === "idle" ? "Sync issue" : phaseLabel}
        </button>
        {runtimePhase === "idle" && <button type="button" onClick={handleForceSync} disabled={isSyncing} className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-surface-container-high text-on-surface"}`}><RefreshCw size={11} />Sync now</button>}
      </div>
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
        {pullComplete ? "Synced just now" : "Sync not checked"}
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
        <span>{runtimePhase === "idle" ? "Syncing…" : phaseLabel} · {pendingCount} pending</span>
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
