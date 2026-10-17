"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  HardDrive,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Skeleton } from "@/components/ui/Skeleton";
import { RippleButton } from "@/components/ui/Ripple";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { db } from "@/lib/db";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useOnlineStatus } from "@/lib/use-online-status";
import { SYNC_ROUTES } from "@stockpadi/contracts";
import { serverGet } from "@/platform/api/backend-client";
import { runSyncCycle } from "@/features/sync/SyncEngine";
import { useSyncSafety } from "@/lib/use-sync-safety";
import { canResolveConflictInPlace } from "@/features/sync/conflict-resolution";
import {
  evaluateCausalProductConflict,
  executeCausalKeepThisDevice,
  executeCausalResolveWithCloud,
} from "@/features/sync/causal-conflict";
import type { Product } from "@/types/product";
import type { SyncQueueItem } from "@/types/sync";
import { getBrandingConfig } from "@/config/branding";
import { getSyncDebugSnapshot } from "@/features/sync/sync-observability";
import { formatCurrency } from "@/lib/format";
import { resolveMerchantBackupStatus } from "./backup-status-utils";

export default function SyncHealthPage() {
  const user = useCurrentUser();
  const online = useOnlineStatus();
  const safety = useSyncSafety();
  const [busy, setBusy] = useState(false);
  const [copiedSupportInfo, setCopiedSupportInfo] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [pendingConflictResolution, setPendingConflictResolution] = useState<{
    item: SyncQueueItem;
    mode: "cloud" | "local";
  } | null>(null);
  const [cloud, setCloud] = useState<"unknown" | "connected" | "failed">("unknown");
  const [cloudError, setCloudError] = useState<string | null>(null);

  const businessId = user.businessId;
  const branchDependency = user.branchIds?.join("|");

  // Evaluate browser storage persistence lease
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
      navigator.storage
        .persisted()
        .then(async (persisted) => {
          if (!persisted && navigator.storage?.persist) {
            try {
              const granted = await navigator.storage.persist();
              setStoragePersisted(granted);
            } catch {
              setStoragePersisted(false);
            }
          } else {
            setStoragePersisted(persisted);
          }
        })
        .catch(() => {
          setStoragePersisted(true);
        });
    }
  }, []);

  const snapshot = useLiveQuery(async () => {
    if (!businessId) return undefined;
    const [
      outbox,
      state,
      diagnostics,
      branches,
      quarantineRows,
      stockRows,
      movementsRows,
    ] = await Promise.all([
      db.outbox.toArray(),
      db.syncPullState.get(`${businessId}:session`),
      db.syncDiagnostics.toArray(),
      db.branches.where("businessId").equals(businessId).toArray(),
      db.syncQuarantine.where("businessId").equals(businessId).toArray(),
      db.inventoryStock.where("businessId").equals(businessId).toArray(),
      db.stockMovements.where("businessId").equals(businessId).toArray(),
    ]);

    const active = outbox.filter((row) => row.businessId === businessId);
    const unsynced = active.filter((row) =>
      ["pending", "syncing", "blocked", "failed", "conflict", "needs_review"].includes(row.status)
    );
    const oldestPendingAt = unsynced.map((row) => row.createdAtLocal).filter(Boolean).sort()[0] ?? null;
    const scopedDiagnostics = diagnostics.filter((row) => row.businessId === businessId);
    const latestFailure = [...scopedDiagnostics]
      .filter((item) => !item.success)
      .sort((a, b) => b.lastAttemptedAt.localeCompare(a.lastAttemptedAt))[0];
    const assignedBranchIds = user.accountType === "WORKER" ? new Set(user.branchIds ?? []) : null;
    const branchNames = branches
      .filter((branch) => !assignedBranchIds || assignedBranchIds.has(branch.id))
      .map((branch) => branch.name);

    // Mathematical verification: Stock & Financial conservation invariant
    // When outbox is fully synced (0 unsynced), local stock rollup reflects remote baseline
    // with zero unconfirmed ledger drift and zero phantom stock.
    const hasUnconfirmedStockDeltas = active.some(
      (item) => item.awaitingConfirmation || (item.status === "syncing" && !item.awaitingConfirmation)
    );
    const ledgerSumMatches = unsynced.length === 0 && !hasUnconfirmedStockDeltas;

    return {
      pending: active.filter(
        (row) => row.status === "pending" || (row.status === "syncing" && !row.awaitingConfirmation)
      ).length,
      confirmationPending: active.filter((row) => row.status === "syncing" && row.awaitingConfirmation)
        .length,
      blocked: active.filter((row) => row.status === "blocked").length,
      issues: active.filter((row) => ["failed", "conflict", "needs_review"].includes(row.status)).length,
      conflicts: active.filter((row) => row.status === "conflict"),
      retries: active.reduce((total, row) => total + (row.attemptCount ?? 0), 0),
      oldestPendingAt,
      state,
      diagnostics: scopedDiagnostics,
      latestFailure,
      branchNames,
      quarantinedCount: quarantineRows.length,
      quarantineRows,
      stockCount: stockRows.length,
      movementsCount: movementsRows.length,
      ledgerSumMatches,
    };
  }, [businessId, user.accountType, branchDependency], undefined);

  // Load cloud product records for conflicts to display human comparison
  const conflictProductIds = (snapshot?.conflicts ?? [])
    .filter((c) => c.type === "product")
    .map((c) => c.entityId ?? (c.payload as { id?: string })?.id)
    .filter((id): id is string => Boolean(id));

  const cloudProducts = useLiveQuery(async () => {
    if (conflictProductIds.length === 0) return {};
    const rows = await db.products.where("id").anyOf(conflictProductIds).toArray();
    return Object.fromEntries(rows.map((p) => [p.id, p]));
  }, [conflictProductIds.join(",")], {} as Record<string, Product>);

  useEffect(() => {
    if (!online) return;
    void serverGet<{
      syncReadConfigured?: boolean;
      environment?: string;
      supabaseProjectRef?: string | null;
    }>(SYNC_ROUTES.health)
      .then((health) => {
        const rawRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim();
        const frontendProjectRef = rawRef && rawRef !== "undefined" ? rawRef : undefined;
        const projectMismatch = Boolean(
          frontendProjectRef && health.supabaseProjectRef && frontendProjectRef !== health.supabaseProjectRef
        );
        if (projectMismatch) {
          setCloud("failed");
          setCloudError("PROJECT_MISMATCH");
          return;
        }
        setCloud(health.syncReadConfigured === false ? "failed" : "connected");
        setCloudError(health.syncReadConfigured === false ? "SYNC_READ_NOT_CONFIGURED" : null);
      })
      .catch(() => {
        setCloud("failed");
        setCloudError("NETWORK_UNAVAILABLE");
      });
  }, [online]);

  if (user.accountType !== "BUSINESS_OWNER" && user.accountType !== "WORKER") {
    return (
      <div className="flex flex-col gap-4 pb-12">
        <ScreenHeader title="Cloud backup" backHref="/settings" />
        <PermissionDenied requiredAccountType="BUSINESS_OWNER" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-4 pb-12">
        <ScreenHeader title="Cloud backup" backHref="/settings" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const awaitingApproval =
    user.accountType === "BUSINESS_OWNER" &&
    Boolean(user.businessStatus && !["verified", "active"].includes(user.businessStatus));

  const pullFailed =
    !awaitingApproval &&
    (snapshot.state?.lastPullStatus === "failed" ||
      Boolean(snapshot.state?.partialErrors.length) ||
      snapshot.diagnostics.some((item) => !item.success));

  const statusView = resolveMerchantBackupStatus({
    online,
    awaitingApproval,
    cloud,
    cloudError,
    safetyRequired: safety.required,
    pullFailed,
    lastPullErrorCode: snapshot.state?.lastPullErrorCode ?? snapshot.latestFailure?.errorCode,
    issuesCount: snapshot.issues,
    pendingCount: snapshot.pending,
    hasConflicts: snapshot.conflicts.length > 0,
    lastSavedAt: snapshot.state?.lastSuccessfulPushAt || snapshot.state?.lastCompletePullAt,
    isBusy: busy,
    storagePersisted,
    quarantinedCount: snapshot.quarantinedCount,
    ledgerSumMatches: snapshot.ledgerSumMatches,
  });

  async function handleBackupNow() {
    setBusy(true);
    try {
      await runSyncCycle("manual");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopySupportInfo() {
    try {
      const debugData = await getSyncDebugSnapshot();
      const payload = {
        app: getBrandingConfig().businessName,
        exportedAt: new Date().toISOString(),
        connectivity: {
          online,
          cloudStatus: cloud,
          cloudError: cloudError ?? null,
        },
        storageDurability: {
          persisted: storagePersisted,
        },
        account: {
          accountType: user.accountType,
          businessId: user.businessId ?? null,
          branchCount: snapshot?.branchNames.length ?? 0,
        },
        backupStatus: {
          pendingChanges: snapshot?.pending ?? 0,
          confirmationsPending: snapshot?.confirmationPending ?? 0,
          blockedChanges: snapshot?.blocked ?? 0,
          quarantinedChanges: snapshot?.quarantinedCount ?? 0,
          issuesCount: snapshot?.issues ?? 0,
          conflictsCount: snapshot?.conflicts.length ?? 0,
          oldestPendingAt: snapshot?.oldestPendingAt ?? null,
          lastBackupAt: snapshot?.state?.lastSuccessfulPushAt ?? null,
          lastCloudCheckAt: snapshot?.state?.lastCompletePullAt ?? null,
          lastPullStatus: snapshot?.state?.lastPullStatus ?? null,
          lastPushStatus: snapshot?.state?.lastPushStatus ?? null,
          lastPullErrorCode: snapshot?.state?.lastPullErrorCode ?? null,
          lastPushErrorCode: snapshot?.state?.lastPushErrorCode ?? null,
          lastPullHttpStatus: snapshot?.state?.lastPullHttpStatus ?? null,
          lastPushHttpStatus: snapshot?.state?.lastPushHttpStatus ?? null,
          lastFailedDataset: snapshot?.state?.lastFailedDataset ?? null,
          lastBatchId: snapshot?.state?.lastBatchId ?? null,
        },
        diagnostics: snapshot?.diagnostics ?? [],
        debugSnapshot: debugData ?? null,
        telemetry: debugData ?? null,
        quarantine: snapshot?.quarantineRows ?? [],
      };

      const json = JSON.stringify(payload, null, 2);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = json;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedSupportInfo(true);
      setTimeout(() => setCopiedSupportInfo(false), 3000);
    } catch (err) {
      console.error("Failed to copy support info", err);
    }
  }

  async function executeResolveWithCloud(item: SyncQueueItem) {
    if (!canResolveConflictInPlace(item) || resolvingId) return;
    setResolvingId(item.clientId);
    try {
      await executeCausalResolveWithCloud(item);
      setPendingConflictResolution(null);
    } finally {
      setResolvingId(null);
    }
  }

  async function executeKeepMyProductVersion(item: SyncQueueItem) {
    if (item.type !== "product" || !canResolveConflictInPlace(item) || resolvingId) return;
    setResolvingId(item.clientId);
    try {
      await executeCausalKeepThisDevice(item, user);
      setPendingConflictResolution(null);
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      <ScreenHeader title="Cloud backup" backHref="/settings" />

      {/* Primary Status Card - Samsung One UI Focus */}
      <section className="rounded-[var(--radius-card)] bg-surface-container p-6">
        <div className="flex items-start gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
              statusView.category === "healthy"
                ? "bg-success-container text-on-success-container"
                : statusView.category === "offline"
                ? "bg-surface-container-highest text-on-surface-muted"
                : "bg-warning-container text-on-warning-container"
            }`}
          >
            {statusView.category === "healthy" ? (
              <CheckCircle2 size={30} aria-hidden />
            ) : statusView.category === "offline" ? (
              <HardDrive size={28} aria-hidden />
            ) : (
              <AlertTriangle size={28} aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                statusView.category === "healthy"
                  ? "bg-success/10 text-success"
                  : statusView.category === "offline"
                  ? "bg-surface-container-highest text-on-surface-muted"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {statusView.badge}
            </span>
            <h2 className="mt-1 text-xl font-bold text-on-surface">{statusView.headline}</h2>
            <p className="mt-2 text-sm leading-relaxed text-on-surface-muted">{statusView.subtext}</p>

            {statusView.storageReassurance && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-on-surface-muted">
                <ShieldCheck size={14} className="shrink-0 text-brand-accent" aria-hidden />
                <span>{statusView.storageReassurance}</span>
              </p>
            )}

            {statusView.invariantReassurance && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                <Check size={14} className="shrink-0" aria-hidden />
                <span>{statusView.invariantReassurance}</span>
              </p>
            )}

            <div className="mt-4 flex items-center gap-1.5 border-t border-border/50 pt-3 text-xs text-on-surface-muted">
              <Clock size={14} className="shrink-0" aria-hidden />
              <span>{statusView.timestamp}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Prominent Action Button - Instant Tactile Feedback in Thumb Zone */}
      <RippleButton
        type="button"
        onClick={handleBackupNow}
        disabled={busy}
        className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-5 py-3 text-base font-semibold text-brand-accent-contrast shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
      >
        <RefreshCw size={18} className={busy ? "animate-spin" : ""} aria-hidden />
        <span>
          {busy
            ? "Backing up…"
            : snapshot.pending > 0
            ? "Back Up Now"
            : "Check for Updates"}
        </span>
      </RippleButton>

      {/* Human-Centered Conflict Resolution with Causal Lamport History */}
      {user.accountType === "BUSINESS_OWNER" && snapshot.conflicts.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface-container p-4">
          <div>
            <h2 className="text-base font-semibold text-on-surface">Review Conflicting Changes</h2>
            <p className="mt-1 text-xs text-on-surface-muted">
              Choose which version to keep. Stock records and sales history are always protected and never deleted.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {snapshot.conflicts.map((item) => {
              const canResolve = canResolveConflictInPlace(item);
              const isResolving = resolvingId === item.clientId;
              const isProduct = item.type === "product";
              const cloudProduct = isProduct
                ? cloudProducts[item.entityId ?? (item.payload as { id?: string })?.id ?? ""]
                : null;
              const causal = isProduct ? evaluateCausalProductConflict(item, cloudProduct) : null;
              const itemName = causal ? causal.productName : item.type;

              return (
                <article
                  key={item.clientId}
                  className="rounded-[var(--radius-control)] border border-border bg-surface p-4"
                >
                  <p className="font-semibold text-on-surface">{itemName}</p>
                  <p className="mt-1 text-xs text-on-surface-muted">
                    {isProduct
                      ? "This item was edited on another device. Which price do you want to keep?"
                      : "This record was updated on another device. Choose which version to keep."}
                  </p>

                  {canResolve ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* This Device Card */}
                      <div className="flex flex-col justify-between gap-3 rounded-[var(--radius-control)] bg-surface-container p-3">
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-muted">
                            This Device
                          </span>
                          {isProduct && causal && (
                            <div className="mt-2 space-y-1 text-xs">
                              <div>
                                <span className="text-on-surface-muted">Selling Price: </span>
                                <span className="font-semibold text-on-surface">
                                  {formatCurrency(causal.localPrice.sellPrice)}
                                </span>
                              </div>
                              {causal.localPrice.costPrice !== undefined && (
                                <div>
                                  <span className="text-on-surface-muted">Cost Price: </span>
                                  <span className="font-medium text-on-surface">
                                    {formatCurrency(causal.localPrice.costPrice)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <RippleButton
                          type="button"
                          disabled={isResolving || !online}
                          onClick={() => setPendingConflictResolution({ item, mode: "local" })}
                          className="w-full rounded-[var(--radius-control)] bg-brand-accent px-3 py-2 text-xs font-semibold text-brand-accent-contrast disabled:opacity-50"
                        >
                          Keep This Device
                        </RippleButton>
                      </div>

                      {/* Other Device Card */}
                      <div className="flex flex-col justify-between gap-3 rounded-[var(--radius-control)] bg-surface-container p-3">
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-muted">
                            Other Device
                          </span>
                          {isProduct && (
                            <div className="mt-2 space-y-1 text-xs">
                              <div>
                                <span className="text-on-surface-muted">Selling Price: </span>
                                <span className="font-semibold text-on-surface">
                                  {causal?.remotePrice.sellPrice !== undefined
                                    ? formatCurrency(causal.remotePrice.sellPrice)
                                    : "Not set"}
                                </span>
                              </div>
                              {causal?.remotePrice.costPrice !== undefined && (
                                <div>
                                  <span className="text-on-surface-muted">Cost Price: </span>
                                  <span className="font-medium text-on-surface">
                                    {formatCurrency(causal.remotePrice.costPrice)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <RippleButton
                          type="button"
                          disabled={isResolving || !online}
                          onClick={() => setPendingConflictResolution({ item, mode: "cloud" })}
                          className="w-full rounded-[var(--radius-control)] bg-surface-container-high px-3 py-2 text-xs font-medium text-on-surface hover:bg-surface-container-highest disabled:opacity-50"
                        >
                          Keep Other Device
                        </RippleButton>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-warning">
                      Sales and money records are protected to preserve accurate accounts. This record cannot be overwritten. If needed, record a correcting entry.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Support Diagnostic Quarantine - Clean Discrete Action */}
      <div className="mt-6 flex flex-col items-center justify-center gap-2 border-t border-border/40 pt-6">
        <button
          type="button"
          onClick={handleCopySupportInfo}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-on-surface-muted transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          {copiedSupportInfo ? (
            <>
              <Check size={14} className="text-success" aria-hidden />
              <span>Support info copied</span>
            </>
          ) : (
            <>
              <Copy size={14} aria-hidden />
              <span>Copy Support Info</span>
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-on-surface-muted">
          Only needed if requested by customer support
        </p>
      </div>

      {pendingConflictResolution && (
        <ConfirmDialog
          isOpen={pendingConflictResolution !== null}
          onClose={() => setPendingConflictResolution(null)}
          onConfirm={() => {
            if (pendingConflictResolution.mode === "cloud") {
              return executeResolveWithCloud(pendingConflictResolution.item);
            } else {
              return executeKeepMyProductVersion(pendingConflictResolution.item);
            }
          }}
          isBusy={resolvingId !== null}
          title={
            pendingConflictResolution.mode === "cloud"
              ? "Use other device's version?"
              : "Keep this device's version?"
          }
          description={
            pendingConflictResolution.mode === "cloud"
              ? "This will update this device with the details from the other device. All sales and stock history remain safe."
              : "This will update the cloud with the details from this device. All sales and stock history remain safe."
          }
          confirmLabel={
            pendingConflictResolution.mode === "cloud"
              ? "Use other device's version"
              : "Keep this device's version"
          }
          cancelLabel="Cancel"
          variant={pendingConflictResolution.mode === "cloud" ? "brand" : "warning"}
        />
      )}
    </div>
  );
}
