"use client";

import { useOnlineStatus } from "@/lib/use-online-status";
import { useFailedSyncCount, usePendingSyncCount } from "@/lib/use-pending-sync-count";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import { useSyncSafety } from "@/lib/use-sync-safety";
import Link from "next/link";

/**
 * Consolidated banner strip for connection and verification
 * status. PWA installation is rendered globally by InstallBanner so a new
 * user can see it before entering the authenticated shell.
 */
export function BannerStrip() {
  const isOnline = useOnlineStatus();
  const pendingCount = usePendingSyncCount();
  const failedCount = useFailedSyncCount();
  const syncPhase = useSyncRuntimePhase();
  const user = useCurrentUserOptional();
  const safety = useSyncSafety();
  const statusDetails = useLiveQuery(async () => {
    const businessId = await getLocalBusinessId();
    if (!businessId) return null;
    const [pull, diagnostics] = await Promise.all([
      db.syncPullState.get(`${businessId}:session`),
      db.syncDiagnostics.where("businessId").equals(businessId).toArray(),
    ]);
    return { lastUpdated: pull?.lastCompletePullAt, failed: diagnostics.some((entry) => !entry.success) };
  }, [user?.id]);
  const showUnverified = Boolean(
    user?.accountType === "BUSINESS_OWNER" &&
    user.businessStatus &&
    user.businessStatus !== "verified" &&
    user.businessStatus !== "active"
  );
  const neutral = "bg-surface-container-high text-on-surface";
  const warning = "bg-warning-container text-on-warning-container";
  const status = failedCount > 0
    ? { label: isOnline ? "Changes need review" : "Offline · Changes need review", tone: "bg-danger", surface: "bg-danger-container text-on-danger-container", action: true }
    : !isOnline
      ? { label: "Offline · Sales stay on this device", tone: "bg-on-surface-muted", surface: neutral, action: false }
      : syncPhase !== "idle"
        ? { label: syncPhase === "downloading" ? "Checking for updates…" : "Saving changes…", tone: "bg-warning", surface: warning, action: false }
        : statusDetails?.failed
          ? { label: "Connection problem", tone: "bg-warning", surface: warning, action: true }
          : safety?.required || pendingCount > 0
            ? { label: safety?.required ? "Save required" : "Changes waiting to upload", tone: "bg-warning", surface: warning, action: true }
            : statusDetails?.lastUpdated
              ? { label: "All saved", tone: "bg-success", surface: "bg-success-container text-on-success-container", action: false }
              : { label: "Online · Waiting for confirmation", tone: "bg-on-surface-muted", surface: neutral, action: false };

  return (
    <div className="flex w-full flex-col">
      {showUnverified && (
        <div className="bg-warning-container border-b border-warning/20 px-4 py-1 text-center text-[length:var(--font-size-caption)] font-medium leading-tight text-on-warning-container">
          Store setup is waiting for approval
        </div>
      )}

      <div className={`flex flex-wrap items-center justify-center gap-x-3 border-b border-current/10 px-gutter py-1 text-center text-[length:var(--font-size-caption)] font-normal leading-tight ${status.surface}`}>
        <div role="status" className="flex min-w-0 items-center justify-center gap-1.5">
          <span aria-hidden data-testid="connection-status-dot" className={`size-1.5 shrink-0 rounded-full ${status.tone}`} />
          <span>{status.label}</span>
        </div>
        {status.action && (
          <Link href="/settings/sync-health" className="inline-flex min-h-[var(--touch-target-min)] items-center font-semibold underline underline-offset-2">View details</Link>
        )}
      </div>
    </div>
  );
}
