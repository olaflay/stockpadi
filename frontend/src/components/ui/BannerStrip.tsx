"use client";

import { useOnlineStatus } from "@/lib/use-online-status";
import { useFailedSyncCount, usePendingSalesCount } from "@/lib/use-pending-sync-count";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

/**
 * Consolidated banner strip for connection, verification, and notification
 * status. PWA installation is rendered globally by InstallBanner so a new
 * user can see it before entering the authenticated shell.
 */
export function BannerStrip() {
  const isOnline = useOnlineStatus();
  const pendingSalesCount = usePendingSalesCount();
  const failedCount = useFailedSyncCount();
  const syncPhase = useSyncRuntimePhase();
  const user = useCurrentUserOptional();
  const showUnverified = Boolean(
    user?.accountType === "BUSINESS_OWNER" &&
    user.businessStatus &&
    user.businessStatus !== "verified" &&
    user.businessStatus !== "active"
  );
  const isSaving = isOnline && (
    syncPhase === "uploading" ||
    syncPhase === "syncing" ||
    syncPhase === "downloading" ||
    pendingSalesCount > 0
  );
  const status = !isOnline
    ? { label: "Offline · Sales stay on this phone", tone: "bg-danger" }
    : failedCount > 0
      ? { label: "Needs attention", tone: "bg-danger" }
      : isSaving
        ? { label: "Saving", tone: "bg-warning" }
        : { label: "Online", tone: "bg-success" };

  return (
    <div className="flex w-full flex-col" role="status" aria-live="polite">
      {showUnverified && (
        <div className="bg-warning-container border-b border-warning/20 px-4 py-1 text-center text-[length:var(--font-size-caption)] font-medium leading-tight text-on-warning-container">
          Store setup is waiting for approval
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 bg-surface-container-high px-4 py-1 text-center text-[length:var(--font-size-caption)] font-medium leading-tight text-on-surface-muted">
        <span aria-hidden data-testid="connection-status-dot" className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.tone}`} />
        <span>{status.label}</span>
      </div>
    </div>
  );
}
