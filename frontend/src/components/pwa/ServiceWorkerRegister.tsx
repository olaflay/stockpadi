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
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Listen for new service worker installation
          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.addEventListener("statechange", () => {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // New version available
                  console.info("[StockPadi PWA] New update installed and ready.");
                }
              });
            }
          });
        })
        .catch((err) => {
          // In development mode, sw.js might be disabled; log as debug
          if (process.env.NODE_ENV !== "production") {
            console.debug("[StockPadi PWA] Service worker registration skipped/inactive in dev:", err.message);
          } else {
            console.warn("[StockPadi PWA] Service worker registration failed:", err);
          }
        });
    }
  }, []);

  return null;
}
