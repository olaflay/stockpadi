"use client";

import { useEffect } from "react";

/**
 * Registers the compiled Serwist service worker (/sw.js) when running on
 * HTTPS or localhost in production/live environments.
 */
export function ServiceWorkerRegister() {
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

      // Do not reload the document when a new worker takes control. A shop
      // may have an in-progress sale or offline write; replacing the page at
      // this point feels like a random refresh. The new worker serves the
      // next navigation while the current React tree keeps running safely.
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") registration?.update().catch(() => {});
      };

      const onUpdateFound = () => {
        const installingWorker = registration?.installing;
        if (!installingWorker) return;
        const onStateChange = () => {
          if (disposed) return;
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.info("[PWA] New update installed; it will be used on the next navigation.");
          }
        };
        installingWorker.addEventListener("statechange", onStateChange, { once: true });
      };

      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((nextRegistration) => {
          if (disposed) return;
          registration = nextRegistration;
          document.addEventListener("visibilitychange", onVisibilityChange);
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
        registration?.removeEventListener("updatefound", onUpdateFound);
      };
    }
  }, []);

  return null;
}
