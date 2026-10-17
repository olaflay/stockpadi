/**
 * Utilities for PWA installation detection, dismissal persistence, and manual triggers.
 * Handles iOS (iPhone, iPod, iPad, iPadOS 13+ desktop-class Safari) and standards-based
 * browsers (Chromium beforeinstallprompt).
 */

import { useSyncExternalStore } from "react";

const INSTALL_DISMISSED_KEY_V3 = "stockpadi-install-dismissed-v3";
const DISMISSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function isIosDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Standard iPhone, iPod, older iPad detection
  const isIosUa = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
  // Modern iPadOS 13+ reports as MacIntel with touch points
  const isIpadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIosUa || isIpadOs;
}

function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as unknown as { standalone?: boolean };
  const isStandaloneNav = nav.standalone === true;
  const isStandaloneMedia =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  return Boolean(isStandaloneNav || isStandaloneMedia);
}

export function isInstallPromptDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(INSTALL_DISMISSED_KEY_V3);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { dismissedAt?: number };
    if (!parsed?.dismissedAt) return false;
    // If dismissed within the cooldown window, honor dismissal; otherwise allow re-prompt
    return Date.now() - parsed.dismissedAt < DISMISSAL_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function rememberInstallPromptDismissal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INSTALL_DISMISSED_KEY_V3,
      JSON.stringify({ dismissedAt: Date.now() })
    );
  } catch {
    // Storage failures must never crash the shell
  }
}

export const OPEN_INSTALL_MODAL_EVENT = "stockpadi:open-install-modal";

/**
 * Programmatically open the install prompt / instructions modal from anywhere
 * (e.g., SideDrawer, Settings, Header).
 */
export function openInstallPrompt(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_INSTALL_MODAL_EVENT));
}

const noopSubscribe = () => () => {};

export function useIsIos(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isIosDevice(),
    () => false
  );
}

export function useIsStandalone(): boolean {
  return useSyncExternalStore(
    (callback) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("appinstalled", callback);
      const media = window.matchMedia?.("(display-mode: standalone)");
      media?.addEventListener?.("change", callback);
      return () => {
        window.removeEventListener("appinstalled", callback);
        media?.removeEventListener?.("change", callback);
      };
    },
    () => isStandaloneApp(),
    () => true
  );
}
