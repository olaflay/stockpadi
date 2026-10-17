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
import { useCurrentUserOptional } from "@/features/auth/use-current-user";

const CLOUD_HEALTH_MAX_AGE_MS = 90_000;
const MANUAL_SYNC_COOLDOWN_MS = 15_000;
let lastManualSyncSuccessAt = 0;

/**
 * Sync status indicator with manual 'Save now' control.
 * In compact mode (for headers/mobile toolbars), renders as a slim icon/counter pill
 * so screen titles ('Sell', 'Products') never get squished or truncated.
 * Supports variant='contrast' for dark/brand-accent headers.
 *
 * Microcopy is short, fast to read, and zero-jargon.
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
  const user = useCurrentUserOptional();
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
  const phaseLabel = runtimePhase === "downloading" ? "Connecting" : "Saving";

  const handleForceSync = async () => {
    if (isSyncing) {
      showToast("Saving…", "neutral");
      return;
    }
    const nowTimestamp = Date.now();
    if (pendingCount === 0 && nowTimestamp - lastManualSyncSuccessAt < MANUAL_SYNC_COOLDOWN_MS && !pullFailure) {
      showToast("All saved.", "success");
      return;
    }

    setIsSyncing(true);
    setSyncRuntimePhase("syncing");
    if (compact && pendingCount > 0) {
      showToast(`Saving ${pendingCount}…`, "neutral");
    }
    try {
      const cycle = await runSyncCycle("manual");
      if (!cycle) return;
      const { pushResult, pullResult } = cycle;
      const businessId = await getLocalBusinessId();
      const unresolvedPushes = businessId
        ? (await db.outbox.toArray()).filter((item) => item.businessId === businessId && ["failed", "conflict"].includes(item.status)).length
        : 0;
      if (pushResult.pendingRemaining === 0 && unresolvedPushes === 0 && pullResult.fullySynced) {
        lastManualSyncSuccessAt = Date.now();
        showToast("Saved.", "success");
      } else if (pushResult.pendingRemaining === 0 && unresolvedPushes === 0 && !pullResult.fullySynced) {
        showToast("Saved on phone.", "neutral");
      } else if (unresolvedPushes > 0) {
        showToast(`${unresolvedPushes} to review.`, "warning");
      } else if (pushResult.drained > 0) {
        showToast(`${pushResult.drained} saved, ${pushResult.pendingRemaining} left…`, "neutral");
      } else {
        showToast(`${pushResult.pendingRemaining} waiting to save.`, "neutral");
      }
    } catch {
      showToast("Could not save. Check connection.", "warning");
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
      await runSyncCycle("manual");
      const firstFailed = await db.outbox.where("status").equals("failed").first();
      const firstBlocked = await db.outbox.where("status").equals("blocked").first();
      if (
        ["ACCOUNT_NOT_APPROVED", "BUSINESS_UNAVAILABLE"].includes(firstFailed?.errorCode ?? "") ||
        ["ACCOUNT_NOT_APPROVED", "BUSINESS_UNAVAILABLE"].includes(firstBlocked?.errorCode ?? "")
      ) {
        showToast("Pending setup. Saved on phone.", "warning");
      } else if (compact) {
        showToast(`Retried ${failedCount}.`, "neutral");
      }
    } finally {
      setIsRetrying(false);
    }
  };

  // High-risk write safety backpressure (100+ unsaved mutations older than 48h)
  if (failedCount === 0 && syncSafety.required) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={openDiagnostics}
            disabled={isSyncing}
            role="status"
            title="Save required"
            aria-label="Save required"
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors active:scale-95 disabled:opacity-60 ${isContrast ? "text-warning hover:bg-white/10" : "text-warning hover:bg-warning-container"}`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
          </button>
          <button
            type="button"
            onClick={handleForceSync}
            disabled={isSyncing}
            title="Save now"
            aria-label="Save now"
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-warning-container text-on-warning-container"}`}
          >
            <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
            <span>Save now</span>
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
        title="Save required"
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:opacity-60 ${isContrast ? "bg-warning text-on-warning" : "bg-warning-container text-on-warning-container"}`}
      >
        <AlertTriangle size={13} aria-hidden />
        Save required
      </button>
    );
  }

  // Failed outbox mutations requiring user review
  if (failedCount > 0) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={openDiagnostics}
            disabled={isRetrying}
            role="status"
            title="Review needed"
            aria-label="Review needed"
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold disabled:opacity-70 transition-transform active:scale-95 ${
              isContrast ? "bg-danger text-on-danger" : "bg-danger-container text-on-danger-container"
            }`}
          >
            <span aria-hidden className="h-2 w-2 rounded-full animate-pulse bg-white" />
            <span className="font-number leading-none">{isRetrying ? "…" : failedCount}</span>
          </button>
          <button
            type="button"
            onClick={handleRetryFailed}
            disabled={isRetrying}
            title="Save now"
            aria-label="Save now"
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors active:scale-95 disabled:opacity-70 ${
              isContrast ? "bg-white/20 text-white hover:bg-white/30" : "bg-danger/10 text-danger hover:bg-danger/20"
            }`}
          >
            <RefreshCw size={11} className={isRetrying ? "animate-spin" : ""} />
            <span>Save now</span>
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
          <span>{failedCount} to review</span>
        </span>
        <button
          type="button"
          onClick={handleRetryFailed}
          disabled={isRetrying}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-[var(--radius-inline)] bg-danger px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-on-danger hover:opacity-90 transition-opacity active:scale-95 disabled:opacity-70"
        >
          <RefreshCw size={12} className={isRetrying ? "animate-spin" : ""} />
          <span>{isRetrying ? "…" : "Save now"}</span>
        </button>
      </div>
    );
  }

  // Offline state with pending items — calm, fast microcopy
  if (!isOnline && pendingCount > 0) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={openDiagnostics}
          role="status"
          title="Offline · Saved on phone"
          aria-label="Offline · Saved on phone"
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-transform active:scale-95 ${
            isContrast ? "bg-white/15 text-white" : "bg-danger-container text-on-danger-container"
          }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: isContrast ? "var(--color-stock-alert)" : "var(--color-danger)" }}
          />
          <span className="font-number leading-none">{pendingCount}</span>
          <RefreshCw size={11} className={isContrast ? "text-danger-container" : "text-danger opacity-80"} />
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={openDiagnostics}
        role="status"
        title="Offline · Saved on phone"
        className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
      >
        <span
          aria-hidden
          className="h-2 w-2 rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span>Offline · Saved</span>
      </button>
    );
  }

  // Ambient demotion: catalog download drops are non-disruptive when pendingCount === 0
  if (pendingCount === 0 && pullFailure) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={openDiagnostics}
          disabled={isSyncing}
          role="status"
          title="All saved"
          aria-label="All saved"
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs transition-colors disabled:opacity-70 ${
            isContrast ? "text-brand-accent-contrast/90 hover:text-white hover:bg-white/10" : "text-on-surface-muted hover:bg-surface-container"
          }`}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: isContrast ? "var(--color-on-brand-container)" : "var(--color-success)" }} />
          <RefreshCw size={11} className={isSyncing ? "animate-spin text-white" : isContrast ? "text-white/80" : "opacity-60"} />
        </button>
      );
    }
    return (
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={openDiagnostics}
          disabled={isSyncing}
          role="status"
          aria-label="All saved"
          className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted transition-colors hover:opacity-90"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />
          All saved
        </button>
        <button
          type="button"
          onClick={handleForceSync}
          disabled={isSyncing}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-on-surface disabled:opacity-60"
        >
          <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
          Save now
        </button>
      </div>
    );
  }

  // Active sync phase or stale server contact
  if (pendingCount === 0 && (runtimePhase !== "idle" || !cloudHealthy)) {
    if (compact) {
      return (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            onClick={openDiagnostics}
            disabled={isSyncing}
            role="status"
            aria-label={runtimePhase === "idle" ? "All saved" : "Saving…"}
            title={runtimePhase === "idle" ? "All saved" : "Saving…"}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${isContrast ? "text-white/80 hover:bg-white/10" : "text-on-surface-muted hover:bg-surface-container"}`}
          >
            <span aria-hidden className={`h-2 w-2 rounded-full ${runtimePhase === "idle" ? "bg-success" : "bg-success animate-pulse"}`} />
          </button>
          {runtimePhase === "idle" && (
            <button
              type="button"
              onClick={handleForceSync}
              disabled={isSyncing}
              title="Save now"
              aria-label="Save now"
              className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-surface-container-high text-on-surface"}`}
            >
              <RefreshCw size={11} />
              <span>Save now</span>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={openDiagnostics}
          disabled={isSyncing}
          role="status"
          aria-label="All saved"
          title="All saved"
          className={`inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] px-2 py-0.5 text-[length:var(--font-size-caption)] transition-colors ${isContrast ? "text-white hover:bg-white/10" : "text-on-surface-muted hover:bg-surface-container"}`}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${runtimePhase === "idle" ? "bg-success" : "bg-success animate-pulse"}`} />
          {runtimePhase === "idle" ? "All saved" : phaseLabel}
        </button>
        {runtimePhase === "idle" && (
          <button
            type="button"
            onClick={handleForceSync}
            disabled={isSyncing}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium disabled:opacity-60 ${isContrast ? "bg-white/20 text-white" : "bg-surface-container-high text-on-surface"}`}
          >
            <RefreshCw size={11} />
            Save now
          </button>
        )}
      </div>
    );
  }

  // Fully healthy and idle
  if (pendingCount === 0 && runtimePhase === "idle" && cloudHealthy) {
    if (compact) {
      return (
        <button
          type="button"
          onClick={openDiagnostics}
          disabled={isSyncing}
          role="status"
          title="All saved"
          aria-label="All saved"
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs transition-colors disabled:opacity-70 ${
            isContrast
              ? "text-brand-accent-contrast/90 hover:text-white hover:bg-white/10"
              : "text-on-surface-muted hover:bg-surface-container"
          }`}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: isContrast ? "var(--color-on-brand-container)" : "var(--color-success)" }}
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
        aria-label="All saved"
        title="All saved"
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] px-2 py-0.5 text-[length:var(--font-size-caption)] text-on-surface-muted hover:bg-surface-container transition-colors disabled:opacity-70"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} />
        {pullComplete ? "All saved" : "Connection not checked"}
        <RefreshCw size={10} aria-hidden />
      </button>
    );
  }

  // Pending changes waiting to save
  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={openDiagnostics}
          role="status"
          title={`${pendingCount} waiting to save`}
          aria-label={`${pendingCount} waiting to save`}
          className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors ${
            isContrast ? "bg-white/15 text-white" : "bg-surface-container-high text-on-surface-muted"
          }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 animate-pulse rounded-full"
            style={{ background: isContrast ? "var(--color-on-brand-container)" : "var(--color-brand-accent)" }}
          />
          <span className="font-number leading-none">{isSyncing ? "…" : pendingCount}</span>
        </button>
        <button
          type="button"
          onClick={handleForceSync}
          disabled={isSyncing}
          role="button"
          title="Save now"
          aria-label="Save now"
          className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors active:scale-95 disabled:opacity-70 ${
            isContrast
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20"
          }`}
        >
          <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
          <span>Save now</span>
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
        title="Open save details"
        aria-label={`${pendingCount} waiting to save`}
        className="inline-flex items-center gap-2 rounded-[var(--radius-inline)] bg-surface-container-high px-3 py-1 text-[length:var(--font-size-caption)] text-on-surface-muted"
      >
        <span
          aria-hidden
          className="h-2 w-2 animate-pulse rounded-full"
          style={{ background: "var(--color-brand-accent)" }}
        />
        <span>{runtimePhase === "idle" ? "Saving…" : phaseLabel} · {pendingCount} waiting</span>
      </button>
      <button
        type="button"
        onClick={handleForceSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-inline)] bg-brand-accent px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-on-brand hover:bg-brand-accent/90 transition-colors active:scale-95 disabled:opacity-70"
      >
        <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
        <span>{isSyncing ? "Saving…" : "Save now"}</span>
      </button>
    </div>
  );
}
