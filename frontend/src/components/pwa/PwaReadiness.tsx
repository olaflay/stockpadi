"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CORE_ROUTES = ["/dashboard", "/pos", "/products", "/customers", "/suppliers", "/purchases", "/expenses", "/sales", "/reports", "/settings", "/settings/sync-health", "/offline"] as const;

/** Requests durable storage and warms the routes a shop needs during a short
 * online window. IndexedDB remains the source of offline data; route
 * prefetching only makes the app shell/navigation available after a cold start. */
export function PwaReadiness() {
  const router = useRouter();

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    if ("storage" in navigator && typeof navigator.storage?.persist === "function") {
      void navigator.storage.persist().catch(() => false);
    }
    for (const route of CORE_ROUTES) router.prefetch(route);
    // Next router prefetch warms RSC payloads, but a cold reopen starts with
    // an HTML navigation. Warm those documents after the active worker takes
    // control so a fresh offline launch does not depend on a prior tab.
    void navigator.serviceWorker?.ready.then(async () => {
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
      }
      await Promise.all(CORE_ROUTES.map((route) => fetch(route, { credentials: "include", headers: { Accept: "text/html" } }).catch(() => undefined)));
    });
  }, [router]);

  return null;
}
