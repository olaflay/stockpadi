"use client";

import { useEffect } from "react";

/** Requests durable storage without doing network work during PWA startup.
 *
 * The service worker caches a route when it is actually visited. Warming every
 * route here caused a newly-installed standalone PWA to start 12 RSC prefetches
 * and 12 HTML requests at once, which is unnecessarily expensive on low-memory
 * Android tablets and can terminate the browser renderer before the first
 * screen is usable.
 */
export function PwaReadiness() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    try {
      if ("storage" in navigator && typeof navigator.storage?.persist === "function") {
        void navigator.storage.persist().catch(() => false);
      }
    } catch {
      // Storage persistence is an optimization. Some standalone browsers can
      // expose the API but still throw while requesting it.
    }
  }, []);

  return null;
}
