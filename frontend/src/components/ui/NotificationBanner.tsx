"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";

export function NotificationBanner() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    return (
      Notification.permission === "default" &&
      localStorage.getItem("stockpadi-notifications-dismissed") !== "true"
    );
  });

  const handleRequestPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === "granted" || permission === "denied") {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("stockpadi-notifications-dismissed", "true");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="relative flex items-center justify-between gap-3 bg-surface-container border-b border-border px-5 py-3 text-on-surface shadow-[var(--shadow-elevation-1)] animate-step-in">
      <div className="flex items-center gap-2 min-w-0">
        <Bell size={18} className="shrink-0 text-brand-accent" />
        <span className="text-[length:var(--font-size-caption)] font-medium truncate">
          Enable alerts for sync status and stock levels
        </span>
      </div>
      <div className="flex items-center gap-2">
        <RippleButton
          type="button"
          onClick={handleRequestPermission}
          className="rounded-[var(--radius-inline)] bg-brand-accent px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-brand-accent-contrast hover:opacity-90 transition-opacity"
        >
          Enable
        </RippleButton>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss notifications prompt"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-on-surface/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
