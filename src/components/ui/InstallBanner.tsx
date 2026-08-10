"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If user has dismissed it recently, don't show
    if (localStorage.getItem("stockpadi-install-dismissed") === "true") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // If already installed, this might trigger
    const appInstalledHandler = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", appInstalledHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("stockpadi-install-dismissed", "true");
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <div className="relative flex items-center justify-between gap-3 bg-brand-accent px-5 py-3 text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] animate-step-in">
      <div className="flex items-center gap-2 min-w-0">
        <Download size={18} className="shrink-0" />
        <span className="text-[length:var(--font-size-caption)] font-medium truncate">
          Install StockPadi for faster, offline access
        </span>
      </div>
      <div className="flex items-center gap-2">
        <RippleButton
          type="button"
          onClick={handleInstallClick}
          className="rounded-[var(--radius-inline)] bg-brand-accent-contrast px-3 py-1 text-[length:var(--font-size-caption)] font-medium text-brand-accent hover:opacity-90 transition-opacity"
        >
          Install
        </RippleButton>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-brand-accent-contrast/10 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
