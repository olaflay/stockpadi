"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import { db } from "@/lib/db";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useOnlineStatus } from "@/lib/use-online-status";
import { serverGet } from "@/features/operations/server-client";
import { drainOutbox } from "@/features/sync/drain-outbox";
import { preloadSessionData } from "@/features/sync/preload-session-data";
import { useSyncSafety } from "@/lib/use-sync-safety";
import { canResolveConflictInPlace, discardConflictingSnapshot } from "@/features/sync/conflict-resolution";
import { writeProductEditOffline } from "@/features/inventory/product-offline-write";
import type { Product } from "@/types/product";
import type { SyncQueueItem } from "@/types/sync";

function formatTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not completed yet";
}

function formatResult(status: "success" | "failed" | null | undefined, code: string | null | undefined, httpStatus: number | null | undefined): string {
  if (!status) return "Not recorded";
  if (status === "success") return "Successful";
  return [code ?? "PULL_FAILED", httpStatus ? `HTTP ${httpStatus}` : null].filter(Boolean).join(" · ");
}

/**
 * Samsung One UI lead: status stays in the viewing area while the retry
 * action remains a full-width, thumb-reachable control below it. Advanced
 * codes are collapsed by default and contain only allow-listed diagnostics.
 */
export default function SyncHealthPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const online = useOnlineStatus();
  const safety = useSyncSafety();
  const [busy, setBusy] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [cloud, setCloud] = useState<"unknown" | "connected" | "failed">("unknown");
  const businessId = user.businessId;
  const branchDependency = user.branchIds?.join("|");
  const snapshot = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const [outbox, state, diagnostics, branches] = await Promise.all([
      db.outbox.toArray(),
      db.syncPullState.get(`${businessId}:session`),
      db.syncDiagnostics.toArray(),
      db.branches.where("businessId").equals(businessId).toArray(),
    ]);
    const active = outbox.filter((row) => row.businessId === businessId);
    const unsynced = active.filter((row) => ["pending", "syncing", "blocked", "failed", "conflict"].includes(row.status));
    const oldestPendingAt = unsynced.map((row) => row.createdAtLocal).filter(Boolean).sort()[0] ?? null;
    const scopedDiagnostics = diagnostics.filter((row) => row.businessId === businessId);
    const latestFailure = [...scopedDiagnostics]
      .filter((item) => !item.success)
      .sort((a, b) => b.lastAttemptedAt.localeCompare(a.lastAttemptedAt))[0];
    const assignedBranchIds = user.accountType === "WORKER" ? new Set(user.branchIds ?? []) : null;
    const branchNames = branches
      .filter((branch) => !assignedBranchIds || assignedBranchIds.has(branch.id))
      .map((branch) => branch.name);
    return {
      pending: active.filter((row) => row.status === "pending" || (row.status === "syncing" && !row.awaitingConfirmation)).length,
      confirmationPending: active.filter((row) => row.status === "syncing" && row.awaitingConfirmation).length,
      blocked: active.filter((row) => row.status === "blocked").length,
      issues: active.filter((row) => ["failed", "conflict"].includes(row.status)).length,
      conflicts: active.filter((row) => row.status === "conflict"),
      retries: active.reduce((total, row) => total + (row.attemptCount ?? 0), 0),
      oldestPendingAt,
      state,
      diagnostics: scopedDiagnostics,
      latestFailure,
      branchNames,
    };
  }, [businessId, user.accountType, branchDependency], undefined);

  useEffect(() => {
    if (!online) return;
    void serverGet<{ syncReadConfigured?: boolean }>("/api/sync/health")
      .then((health) => setCloud(health.syncReadConfigured === false ? "failed" : "connected"))
      .catch(() => setCloud("failed"));
  }, [online]);

  if (user.accountType !== "BUSINESS_OWNER") return <><ScreenHeader title="Sync and system health" onBack={() => router.push("/settings")} /><PermissionDenied requiredAccountType="BUSINESS_OWNER" /></>;
  if (!snapshot) return <><ScreenHeader title="Sync and system health" onBack={() => router.push("/settings")} /><Skeleton className="h-48" /></>;

  const pullFailed = snapshot.state?.lastPullStatus === "failed" || Boolean(snapshot.state?.partialErrors.length) || snapshot.diagnostics.some((item) => !item.success);
  const complete = online && cloud === "connected" && Boolean(snapshot.state?.lastCompletePullAt) && snapshot.pending === 0 && snapshot.blocked === 0 && snapshot.issues === 0 && !pullFailed && !safety.required;
  const status = !online ? "Offline" : cloud === "failed" ? "Service unavailable" : safety.required ? "Sync required" : snapshot.issues > 0 || pullFailed ? "Sync issue" : complete ? "Healthy" : "Pending";
  const description = pullFailed
    ? "We couldn't download the latest stock from the cloud. Your local data is still safe."
    : complete
      ? "Cloud data and this device are up to date."
      : "Some changes are still waiting to finish syncing.";

  async function syncNow() {
    setBusy(true);
    try {
      await drainOutbox();
      await preloadSessionData(true, "manual");
    } finally {
      setBusy(false);
    }
  }

  async function useCloudVersion(item: SyncQueueItem) {
    if (!canResolveConflictInPlace(item) || resolvingId) return;
    if (!window.confirm("Discard this device's rejected change and download the cloud version?")) return;
    setResolvingId(item.clientId);
    try {
      await discardConflictingSnapshot(item);
      await preloadSessionData(true, "manual");
    } finally {
      setResolvingId(null);
    }
  }

  async function keepMyProductVersion(item: SyncQueueItem) {
    if (item.type !== "product" || !canResolveConflictInPlace(item) || resolvingId) return;
    if (!window.confirm("Replace the cloud product details with this device's version? Stock history will not be changed.")) return;
    setResolvingId(item.clientId);
    const desired = item.payload as Product;
    try {
      await discardConflictingSnapshot(item);
      const pull = await preloadSessionData(true, "manual");
      const productId = item.entityId ?? desired.id;
      const cloudProduct = productId ? await db.products.get(productId) : undefined;
      if (!pull.fullySynced || !cloudProduct) {
        // Never drop an owner change merely because the refresh failed.
        await db.outbox.put(item);
        throw new Error("The cloud version could not be confirmed. Your change remains in the conflict list.");
      }
      await writeProductEditOffline(cloudProduct.id, { ...desired, version: cloudProduct.version, updatedAt: new Date().toISOString() }, null, user);
    } finally {
      setResolvingId(null);
    }
  }

  const StatusIcon = pullFailed ? AlertTriangle : CheckCircle2;
  const branchLabel = snapshot.branchNames.length ? snapshot.branchNames.join(", ") : "All permitted branches";

  return (
    <div className="flex flex-col gap-4 pb-12">
      <ScreenHeader title="Sync and system health" onBack={() => router.push("/settings")} />

      <section className={`rounded-[var(--radius-card)] p-4 ${pullFailed ? "bg-warning-container text-on-warning-container" : "bg-surface-container"}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${pullFailed ? "bg-warning text-on-warning" : "bg-success-container text-on-success-container"}`}>
            <StatusIcon size={24} aria-hidden />
          </div>
          <div>
            <h2 className="text-[length:var(--font-size-body-lg)] font-semibold">{status}</h2>
            <p className="mt-1 text-[length:var(--font-size-body)]">{description}</p>
            <p className="mt-2 text-[length:var(--font-size-caption)]">Last successful sync: {formatTime(snapshot.state?.lastCompletePullAt)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
        <div className="grid grid-cols-2 gap-3 text-[length:var(--font-size-caption)]">
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">{online ? <Wifi className="mr-1 inline" size={14} /> : <WifiOff className="mr-1 inline" size={14} />} Internet: {online ? "Connected" : "Offline"}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Cloud: {cloud === "connected" ? "Connected" : cloud === "failed" ? "Unavailable" : "Checking"}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Pending upload: {snapshot.pending}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Verifying cloud stock: {snapshot.confirmationPending}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Issues: {snapshot.blocked + snapshot.issues}</p>
          <p className="rounded-[var(--radius-control)] bg-surface-container-high p-3">Retry count: {snapshot.state?.pullRetryCount ?? snapshot.retries}</p>
        </div>
      </section>

      <RippleButton type="button" onClick={syncNow} disabled={busy || !online} className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-4 text-brand-accent-contrast disabled:opacity-50">
        <RefreshCw size={18} className={busy ? "animate-spin" : ""} aria-hidden />
        {busy ? "Syncing…" : "Retry sync"}
      </RippleButton>

      <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
        <h2 className="mb-3 text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">Pull status</h2>
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Last complete pull: {formatTime(snapshot.state?.lastCompletePullAt)}</p>
        <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Last successful push: {formatTime(snapshot.state?.lastSuccessfulPushAt)}</p>
        <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Oldest pending change: {snapshot.oldestPendingAt ? new Date(snapshot.oldestPendingAt).toLocaleString() : "None"}</p>
      </section>

      {snapshot.conflicts.length > 0 && (
        <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
          <h2 className="text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">Review sync conflicts</h2>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Choose which catalogue version to keep. Stock and sales history can never be deleted here.</p>
          <div className="mt-3 flex flex-col gap-3">
            {snapshot.conflicts.map((item) => {
              const canResolve = canResolveConflictInPlace(item);
              const isResolving = resolvingId === item.clientId;
              return (
                <article key={item.clientId} className="rounded-[var(--radius-control)] bg-surface-container-high p-3">
                  <p className="font-medium text-on-surface">{item.type === "product" && typeof (item.payload as { name?: unknown }).name === "string" ? (item.payload as { name: string }).name : item.type}</p>
                  <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">{item.lastErrorMessage ?? "This record changed on another device."}</p>
                  {canResolve ? (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <RippleButton type="button" disabled={isResolving} onClick={() => void useCloudVersion(item)} className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-surface px-3 text-[length:var(--font-size-caption)] font-medium text-on-surface disabled:opacity-50">Use cloud version</RippleButton>
                      {item.type === "product" && <RippleButton type="button" disabled={isResolving} onClick={() => void keepMyProductVersion(item)} className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-3 text-[length:var(--font-size-caption)] font-medium text-brand-accent-contrast disabled:opacity-50">Keep my product version</RippleButton>}
                    </div>
                  ) : <p className="mt-3 text-[length:var(--font-size-caption)] text-warning">Ledger history is protected. Resolve this by creating a correcting stock or sales entry.</p>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <details className="rounded-[var(--radius-card)] bg-surface-container p-4 text-on-surface">
        <summary className="cursor-pointer text-[length:var(--font-size-body-lg)] font-semibold">Advanced diagnostics</summary>
        <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3 gap-y-2 text-[length:var(--font-size-caption)]">
          <dt className="text-on-surface-muted">Last push result</dt><dd className="break-words">{formatResult(snapshot.state?.lastPushStatus, snapshot.state?.lastPushErrorCode, snapshot.state?.lastPushHttpStatus)}</dd>
          <dt className="text-on-surface-muted">Last pull result</dt><dd className="break-words">{formatResult(snapshot.state?.lastPullStatus, snapshot.state?.lastPullErrorCode ?? snapshot.latestFailure?.errorCode, snapshot.state?.lastPullHttpStatus ?? snapshot.latestFailure?.httpStatus)}</dd>
          <dt className="text-on-surface-muted">Failed dataset</dt><dd>{snapshot.state?.lastFailedDataset ?? snapshot.latestFailure?.entity ?? "None"}</dd>
          <dt className="text-on-surface-muted">Branch</dt><dd className="break-words">{branchLabel}</dd>
          <dt className="text-on-surface-muted">Pending count</dt><dd>{snapshot.pending + snapshot.blocked + snapshot.issues}</dd>
          <dt className="text-on-surface-muted">Retry count</dt><dd>{snapshot.state?.pullRetryCount ?? 0}</dd>
          <dt className="text-on-surface-muted">Next automatic retry</dt><dd>{snapshot.state?.nextPullAttemptAt ? new Date(snapshot.state.nextPullAttemptAt).toLocaleString() : "Not scheduled"}</dd>
        </dl>
      </details>

      <section className="rounded-[var(--radius-card)] bg-surface-container p-4">
        <h2 className="mb-3 text-[length:var(--font-size-body-lg)] font-semibold text-on-surface">Datasets</h2>
        <div className="flex flex-col gap-2">
          {snapshot.diagnostics.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b border-border py-2 text-[length:var(--font-size-caption)]">
              <span className="text-on-surface">{item.entity}</span>
              <span className={item.success ? "text-success" : "text-danger"}>{item.success ? `${item.recordsApplied} received` : [item.errorCode ?? "PULL_FAILED", item.httpStatus ? `HTTP ${item.httpStatus}` : null].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
