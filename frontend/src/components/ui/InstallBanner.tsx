"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { RippleButton } from "@/components/ui/Ripple";
import { getBrandingConfig } from "@/config/branding";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Versioned so users who dismissed the old shell-only banner get the improved
// first-run prompt again; dismissal still remains sticky for this version.
const INSTALL_DISMISSED_KEY = "stockpadi-install-dismissed-v2";

function isInstallPromptDismissed(): boolean {
  try {
    return window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberInstallPromptDismissal(): void {
  try {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
  } catch {
    // Dismissal is optional; never let storage failure break the app shell.
  }
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const branding = getBrandingConfig();

  useEffect(() => {
    // If user has dismissed it recently, don't show
    if (isInstallPromptDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const appInstalledHandler = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", appInstalledHandler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", appInstalledHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    rememberInstallPromptDismissal();
    setVisible(false);
  };

  if (!visible || !deferredPrompt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex items-center justify-between gap-3 bg-brand-accent px-5 py-3 text-brand-accent-contrast shadow-[var(--shadow-elevation-1)] animate-step-in"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Download size={18} className="shrink-0" />
        <span className="text-[length:var(--font-size-caption)] font-medium truncate">
          Install {branding.businessName} for faster, offline access
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
