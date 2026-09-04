"use client";

import { useEffect, useState } from "react";
import { Download, X, Bell } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";
import { useOnlineStatus } from "@/lib/use-online-status";
import { usePendingSyncCount } from "@/lib/use-pending-sync-count";

const UNSYNCED_HEADS_UP = 250;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Consolidated banner strip: merges OfflineBanner, InstallBanner, and
 * NotificationBanner into one compact stacked container. Shows at most
 * 2 banners at once (offline takes priority), each in a single slim row.
 * Reduces top-of-screen visual noise from 3 potential full-width banners
 * down to 1 compact strip.
 */
export function BannerStrip() {
  const isOnline = useOnlineStatus();
  const pendingCount = usePendingSyncCount();

  // Install banner state
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);

  // Notification banner state
  const [showNotification, setShowNotification] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    return (
      Notification.permission === "default" &&
      localStorage.getItem("stockpadi-notifications-dismissed") !== "true"
    );
  });

  useEffect(() => {
    if (localStorage.getItem("stockpadi-install-dismissed") === "true") return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    const appInstalledHandler = () => { setShowInstall(false); setDeferredPrompt(null); };
    window.addEventListener("appinstalled", appInstalledHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") { setDeferredPrompt(null); setShowInstall(false); }
  };

  const handleDismissInstall = () => {
    localStorage.setItem("stockpadi-install-dismissed", "true");
    setShowInstall(false);
  };

  const handleEnableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted" || permission === "denied") setShowNotification(false);
  };

  const handleDismissNotifications = () => {
    localStorage.setItem("stockpadi-notifications-dismissed", "true");
    setShowNotification(false);
  };

  const showOffline = !isOnline;
  const hasAnyBanner = showOffline || showInstall || showNotification;
  if (!hasAnyBanner) return null;

  return (
    <div className="flex w-full flex-col" role="status">
      {/* Offline banner — slim, persistent, top priority */}
      {showOffline && (
        <div className="bg-warning-container px-4 py-1.5 text-center text-[length:var(--font-size-caption)] text-on-warning-container">
          {pendingCount >= UNSYNCED_HEADS_UP
            ? `Offline — ${pendingCount} changes saved, will sync when online`
            : "Offline — changes are saved locally and will sync when online"}
        </div>
      )}

      {/* Install banner — slim single row */}
      {showInstall && (
        <div className="flex items-center justify-between gap-2 bg-brand-accent px-4 py-2 shadow-[var(--shadow-elevation-1)] animate-step-in">
          <div className="flex items-center gap-2 min-w-0">
            <Download size={14} className="shrink-0 text-brand-accent-contrast" />
            <span className="text-[length:var(--font-size-caption)] font-medium text-brand-accent-contrast truncate">
              Install for faster offline access
            </span>
          </div>
          <div className="flex items-center gap-1">
            <RippleButton
              type="button"
              onClick={handleInstall}
              className="rounded-[var(--radius-inline)] bg-brand-accent-contrast px-2.5 py-0.5 text-[length:var(--font-size-caption)] font-medium text-brand-accent hover:opacity-90 transition-opacity"
            >
              Install
            </RippleButton>
            <button
              type="button"
              onClick={handleDismissInstall}
              aria-label="Dismiss"
              className="flex h-6 w-6 items-center justify-center rounded-full text-brand-accent-contrast hover:bg-brand-accent-contrast/10"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Notification banner — slim single row */}
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
