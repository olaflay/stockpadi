"use client";

import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

const CART_DRAFT_KEY = "stockpadi-cart";

function hasActiveCartDraft(): boolean {
  try {
    const raw = window.sessionStorage.getItem(CART_DRAFT_KEY);
    if (!raw) return false;
    const draft = JSON.parse(raw) as unknown;
    return Boolean(draft && typeof draft === "object" && Object.keys(draft).length > 0);
  } catch {
    // If the draft cannot be read, wait rather than risking a refresh while a
    // cashier may have an active cart in session storage.
    return true;
  }
}

/**
 * Registers the compiled Serwist service worker (/sw.js) when running on
 * HTTPS or localhost in production/live environments.
 */
export function ServiceWorkerRegister() {
  const pathname = usePathname();
  const syncPhase = useSyncRuntimePhase();
  const [updateReady, setUpdateReady] = useState(false);
  const [cartDraftActive, setCartDraftActive] = useState(false);
  const autoReloadScheduled = useRef(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1")
    ) {
      let disposed = false;
      let registration: ServiceWorkerRegistration | null = null;

      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") registration?.update().catch(() => {});
      };

      const onPageShow = () => registration?.update().catch(() => {});
      const onOnline = () => registration?.update().catch(() => {});

      const onUpdateFound = () => {
        const installingWorker = registration?.installing;
        if (!installingWorker) return;
        const onStateChange = () => {
          if (disposed) return;
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            setCartDraftActive(hasActiveCartDraft());
            setUpdateReady(true);
          }
        };
        installingWorker.addEventListener("statechange", onStateChange, { once: true });
      };

      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((nextRegistration) => {
          if (disposed) return;
          registration = nextRegistration;
          if (registration.waiting && navigator.serviceWorker.controller) {
            setCartDraftActive(hasActiveCartDraft());
            setUpdateReady(true);
          }
          document.addEventListener("visibilitychange", onVisibilityChange);
          window.addEventListener("pageshow", onPageShow);
          window.addEventListener("online", onOnline);
          registration.addEventListener("updatefound", onUpdateFound);
        })
        .catch((err) => {
          // In development mode, sw.js might be disabled; log as debug
          if (process.env.NODE_ENV !== "production") {
            console.debug("[PWA] Service worker registration skipped/inactive in dev:", err.message);
          } else {
            console.warn("[PWA] Service worker registration failed:", err);
          }
        });

      return () => {
        disposed = true;
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.removeEventListener("pageshow", onPageShow);
        window.removeEventListener("online", onOnline);
        registration?.removeEventListener("updatefound", onUpdateFound);
      };
    }
  }, []);

  // Once an update is ready, keep checking only the local safety conditions.
  // This does not start or stop sync; it merely waits for a safe page boundary
  // before replacing the React bundle.
  useEffect(() => {
    if (!updateReady) return;

    const checkCart = () => setCartDraftActive(hasActiveCartDraft());
    checkCart();
    const timer = window.setInterval(checkCart, 1000);
    return () => window.clearInterval(timer);
  }, [updateReady]);

  useEffect(() => {
    if (!updateReady || cartDraftActive || syncPhase !== "idle" || autoReloadScheduled.current) return;

    autoReloadScheduled.current = true;
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cartDraftActive, pathname, syncPhase, updateReady]);

  if (!updateReady || !cartDraftActive) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] z-[9998] mx-auto flex w-auto max-w-md items-center gap-3 rounded-[var(--radius-control)] border border-brand-accent/20 bg-surface-container-high px-3.5 py-3 text-on-surface shadow-[var(--shadow-elevation-3)]"
    >
      <RefreshCw size={18} className="shrink-0 text-brand-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-[length:var(--font-size-caption)] font-medium leading-snug">
        Update ready. We&apos;ll refresh after this sale is finished.
      </p>
    </div>
  );
}
