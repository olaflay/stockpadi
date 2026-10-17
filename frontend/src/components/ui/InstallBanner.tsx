"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { RippleButton } from "@/components/ui/Ripple";
import { getBrandingConfig } from "@/config/branding";
import { IosInstallModal } from "@/components/ui/IosInstallModal";
import {
  useIsIos,
  useIsStandalone,
  isInstallPromptDismissed,
  rememberInstallPromptDismissal,
  OPEN_INSTALL_MODAL_EVENT,
} from "@/lib/pwa-install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isIos = useIsIos();
  const isStandalone = useIsStandalone();
  const [isDismissed, setIsDismissed] = useState(() => isInstallPromptDismissed());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pathname = usePathname();
  const branding = getBrandingConfig();

  useEffect(() => {
    const beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const appInstalledHandler = () => {
      setIsDismissed(true);
      setIsModalOpen(false);
      setDeferredPrompt(null);
    };

    // Handler for programmatic triggers (e.g. from SideDrawer or Settings)
    const openModalHandler = () => {
      if (isIos) {
        setIsModalOpen(true);
      } else if (deferredPrompt) {
        void (async () => {
          try {
            await deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice.outcome === "accepted") {
              setIsDismissed(true);
            }
          } catch {
            // Hardened browsers or already-consumed prompt must not bubble unhandled rejection
          }
        })();
      } else {
        // Fallback on desktop/other browser without deferred prompt
        setIsModalOpen(true);
      }
    };

    window.addEventListener("beforeinstallprompt", beforeInstallHandler);
    window.addEventListener("appinstalled", appInstalledHandler);
    window.addEventListener(OPEN_INSTALL_MODAL_EVENT, openModalHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
      window.removeEventListener(OPEN_INSTALL_MODAL_EVENT, openModalHandler);
    };
  }, [deferredPrompt, isIos]);

  const handleInstallClick = async () => {
    if (isIos) {
      setIsModalOpen(true);
      return;
    }
    if (!deferredPrompt) {
      setIsModalOpen(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsDismissed(true);
      }
    } catch {
      // Ignore user cancellation or prompt errors
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    rememberInstallPromptDismissal();
    setIsDismissed(true);
  };

  // Determine if banner should be rendered
  const visible = !isStandalone && !isDismissed && (isIos || Boolean(deferredPrompt));

  // Determine if this is an app-shell page with a BottomNav bar
  const isAuthOrStandaloneRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/pending-approval" ||
    pathname === "/verify-email" ||
    pathname === "/offline";

  return (
    <>
      {visible && (
        <div
          role="status"
          aria-live="polite"
          data-install-banner="true"
          className={`fixed inset-x-3 sm:left-auto sm:right-4 sm:max-w-md z-45 flex items-center justify-between gap-3 rounded-2xl bg-brand-accent p-3.5 text-brand-accent-contrast shadow-[var(--shadow-elevation-3)] animate-step-in transition-all duration-200 ${
            isAuthOrStandaloneRoute
              ? "bottom-[max(1rem,env(safe-area-inset-bottom,1rem))]"
              : "bottom-[calc(68px+max(0.75rem,env(safe-area-inset-bottom,0.75rem)))]"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <Download size={18} className="shrink-0" />
            {isIos ? (
              <span className="text-[length:var(--font-size-caption)] font-medium leading-tight">
                Install {branding.businessName}: tap{" "}
                <Share size={13} className="inline-block mx-0.5 -mt-0.5" /> then &ldquo;Add to Home Screen&rdquo;
              </span>
            ) : (
              <span className="text-[length:var(--font-size-caption)] font-medium truncate">
                Install {branding.businessName} for faster, offline access
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isIos ? (
              <RippleButton
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="rounded-[var(--radius-inline)] bg-brand-accent-contrast px-2.5 py-1 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:opacity-90 transition-opacity"
              >
                Instructions
              </RippleButton>
            ) : (
              <RippleButton
                type="button"
                onClick={handleInstallClick}
                className="rounded-[var(--radius-inline)] bg-brand-accent-contrast px-3 py-1 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:opacity-90 transition-opacity"
              >
                Install
              </RippleButton>
            )}

            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install prompt"
              className="flex h-7 w-7 items-center justify-center rounded-full text-brand-accent-contrast hover:bg-brand-accent-contrast/15 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      <IosInstallModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}
