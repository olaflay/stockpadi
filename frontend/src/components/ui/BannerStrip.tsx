"use client";

import { useState } from "react";
import { X, Bell } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";
import { useOnlineStatus } from "@/lib/use-online-status";
import { useFailedSyncCount, usePendingSalesCount } from "@/lib/use-pending-sync-count";
import { useCurrentUserOptional } from "@/features/auth/use-current-user";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

const NOTIFICATIONS_DISMISSED_KEY = "stockpadi-notifications-dismissed";

function areNotificationsDismissed(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATIONS_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberNotificationDismissal(): void {
  try {
    window.localStorage.setItem(NOTIFICATIONS_DISMISSED_KEY, "true");
  } catch {
    // Notification preferences must not prevent the authenticated shell from
    // rendering when installed-browser storage is unavailable.
  }
}

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
  const [showNotification, setShowNotification] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    return Notification.permission === "default" && !areNotificationsDismissed();
  });

  const handleEnableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted" || permission === "denied") setShowNotification(false);
  };

  const handleDismissNotifications = () => {
    rememberNotificationDismissal();
    setShowNotification(false);
  };

  const user = useCurrentUserOptional();
  const showUnverified = Boolean(
    user?.accountType === "BUSINESS_OWNER" &&
    user.businessStatus &&
    user.businessStatus !== "verified" &&
    user.businessStatus !== "active"
  );
  const salesWaiting = `${pendingSalesCount} ${pendingSalesCount === 1 ? "sale" : "sales"} waiting`;
  const syncStatus = !isOnline
    ? "Offline"
    : failedCount > 0
      ? "Sync issue"
      : syncPhase === "uploading" || syncPhase === "downloading" || syncPhase === "syncing"
        ? pendingSalesCount > 0 ? salesWaiting : "Online"
        : pendingSalesCount > 0
          ? salesWaiting
          : "Online";

  const syncStatusTone = !isOnline || failedCount > 0
    ? "bg-danger"
    : syncPhase === "uploading" || syncPhase === "downloading" || syncPhase === "syncing"
      ? "bg-warning"
      : "bg-success";

  return (
    <div className="flex w-full flex-col" role="status" aria-live="polite">
      {showUnverified && (
        <div className="bg-amber-500/15 border-b border-amber-500/20 px-4 py-1.5 text-center text-[length:var(--font-size-caption)] font-medium text-amber-950 dark:text-amber-200">
          Store pending admin approval · Changes are saved locally and will sync once verified
        </div>
      )}

      <div className="flex items-center justify-center gap-1.5 border-b border-border bg-surface-container-high px-4 py-1.5 text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${syncStatusTone}`} />
        <span>{syncStatus}</span>
      </div>

      {showNotification && (
        <div className="flex items-center justify-between gap-2 bg-surface-container border-b border-border px-4 py-2 shadow-[var(--shadow-elevation-1)] animate-step-in">
          <div className="flex items-center gap-2 min-w-0">
            <Bell size={14} className="shrink-0 text-brand-accent" />
            <span className="text-[length:var(--font-size-caption)] font-medium text-on-surface truncate">
              Enable sync &amp; stock alerts
            </span>
          </div>
          <div className="flex items-center gap-1">
            <RippleButton
              type="button"
              onClick={handleEnableNotifications}
              className="rounded-[var(--radius-inline)] bg-brand-accent px-2.5 py-0.5 text-[length:var(--font-size-caption)] font-medium text-brand-accent-contrast hover:opacity-90 transition-opacity"
            >
              Enable
            </RippleButton>
            <button
              type="button"
              onClick={handleDismissNotifications}
              aria-label="Dismiss"
              className="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-muted hover:bg-on-surface/10"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
