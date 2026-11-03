"use client";

import { useCallback, useEffect, useState } from "react";
import { useOffline } from "next/offline";
import { WifiOff } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { isOfflineRoute, OFFLINE_WARM_ROUTES } from "@/lib/offline-routes";
import { resolveRouteWarmingStrategy, type ConnectionHints } from "@/lib/route-warming";

interface NavigatorWithConnection extends Navigator {
  connection?: ConnectionHints;
}

function waitForIdle(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      idleWindow.requestIdleCallback(() => resolve(), { timeout });
      return;
    }
    globalThis.setTimeout(resolve, Math.min(timeout, 500));
  });
}

function sameOriginDestination(anchor: HTMLAnchorElement): URL | null {
  try {
    const url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin ? url : null;
  } catch {
    return null;
  }
}

/**
 * Keeps offline navigation inside the app. Supported routes are warmed while
 * online and use a document navigation while offline so Serwist can serve the
 * cached HTML shell. Online-only routes never reach the browser error page.
 */
export function OfflineNavigationGuard() {
  const [blockedPath, setBlockedPath] = useState<string | null>(null);
  const frameworkOffline = useOffline();

  const handleDocumentClick = useCallback((event: MouseEvent) => {
    if ((!frameworkOffline && navigator.onLine) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const destination = sameOriginDestination(anchor);
    if (!destination) return;

    event.preventDefault();
    if (!isOfflineRoute(destination.pathname)) {
      setBlockedPath(destination.pathname);
      return;
    }

    // A full document request lets the service worker answer from the warmed
    // navigation cache. Soft navigation would request an uncached RSC payload.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate service-worker document navigation for offline cache fallback
    window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
  }, [frameworkOffline]);

  useEffect(() => {
    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [handleDocumentClick]);

  useEffect(() => {
    if (frameworkOffline || !navigator.onLine || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const connection = (navigator as NavigatorWithConnection).connection;
    const strategy = resolveRouteWarmingStrategy(connection);

    void navigator.serviceWorker.ready.then(async () => {
      if (cancelled) return;
      await new Promise((resolve) => window.setTimeout(resolve, strategy.initialDelayMs));
      // Sequential idle-time warming avoids competing with a route the user
      // actually requested, especially on constrained Nigerian connections.
      for (const route of OFFLINE_WARM_ROUTES) {
        if (cancelled || !navigator.onLine) break;
        try {
          await waitForIdle(strategy.idleTimeoutMs);
          if (cancelled || !navigator.onLine) break;
          // Avoid re-downloading a document the service worker has already
          // warmed on every app-shell mount.
          if ("caches" in window && await window.caches.match(route)) continue;
          await fetch(route, {
            headers: { Accept: "text/html" },
            credentials: "same-origin",
            priority: "low",
          } as RequestInit & { priority: "low" });
          await new Promise((resolve) => window.setTimeout(resolve, strategy.betweenRoutesMs));
        } catch {
          break;
        }
      }
    });

    return () => { cancelled = true; };
  }, [frameworkOffline]);

  return (
    <ConfirmDialog
      isOpen={blockedPath !== null}
      onClose={() => setBlockedPath(null)}
      onConfirm={() => setBlockedPath(null)}
      title="This page needs a connection"
      description="You’re currently offline and this page isn’t available offline. Your saved work is safe on this device."
      confirmLabel="Stay here"
      hideCancelButton
      variant="info"
      icon={<WifiOff size={22} aria-hidden />}
    />
  );
}
