"use client";

import { useCallback, useEffect, useState } from "react";
import { useOffline } from "next/offline";
import { usePathname } from "next/navigation";
import { OfflineNotice } from "@/components/ui/OnlineOnlyButton";
import { isOfflineRoute, offlineDocumentCacheKey, OFFLINE_WARM_ROUTES } from "@/lib/offline-routes";
import { resolveRouteWarmingStrategy, type ConnectionHints } from "@/lib/route-warming";
import { useSyncRuntimePhase } from "@/features/sync/sync-runtime-state";

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
  const pathname = usePathname();
  const syncPhase = useSyncRuntimePhase();

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

    // Never leave a working app screen unless a controlling worker can answer
    // the document request. Without this check Android Chrome replaces the app
    // with ERR_FAILED and the cashier cannot get back without relaunching.
    void (async () => {
      const hasController = Boolean(navigator.serviceWorker?.controller);
      const cached = "caches" in window
        ? await window.caches.match(offlineDocumentCacheKey(destination)).catch(() => undefined)
        : undefined;
      if (!hasController || !cached) {
        setBlockedPath(destination.pathname);
        return;
      }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- verified cached document navigation
      window.location.assign(`${destination.pathname}${destination.search}${destination.hash}`);
    })();
  }, [frameworkOffline]);

  useEffect(() => {
    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [handleDocumentClick]);

  useEffect(() => {
    if (frameworkOffline || !navigator.onLine || !("serviceWorker" in navigator) || syncPhase !== "idle") return;
    const abort = new AbortController();
    const connection = (navigator as NavigatorWithConnection).connection;
    const strategy = resolveRouteWarmingStrategy(connection);
    const isEligible = () => !abort.signal.aborted && navigator.onLine && document.visibilityState === "visible";

    void navigator.serviceWorker.ready.then(async () => {
      // Fetch warming only reaches the worker when this document is already
      // controlled. On a first install an uncontrolled fetch merely duplicates
      // startup traffic without filling the navigation cache; the registration
      // component warms the two boot routes through postMessage instead.
      if (!isEligible() || !navigator.serviceWorker.controller) return;
      await new Promise((resolve) => window.setTimeout(resolve, strategy.initialDelayMs));
      // Sequential idle-time warming avoids competing with a route the user
      // actually requested, especially on constrained Nigerian connections.
      for (const route of OFFLINE_WARM_ROUTES) {
        if (!isEligible()) break;
        try {
          await waitForIdle(strategy.idleTimeoutMs);
          if (!isEligible()) break;
          // Avoid re-downloading a document the service worker has already
          // warmed on every app-shell mount.
          if ("caches" in window && await window.caches.match(route)) continue;
          if (!isEligible()) break;
          await fetch(route, {
            headers: { Accept: "text/html" },
            credentials: "same-origin",
            priority: "low",
            signal: abort.signal,
          } as RequestInit & { priority: "low" });
          await new Promise((resolve) => window.setTimeout(resolve, strategy.betweenRoutesMs));
        } catch {
          break;
        }
      }
    });

    const yieldToNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          !(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = sameOriginDestination(anchor);
      if (target && target.pathname !== pathname) abort.abort();
    };
    document.addEventListener("click", yieldToNavigation, true);
    return () => {
      abort.abort();
      document.removeEventListener("click", yieldToNavigation, true);
    };
  }, [frameworkOffline, pathname, syncPhase]);

  return (
    <OfflineNotice
      isOpen={blockedPath !== null}
      onClose={() => setBlockedPath(null)}
      navigation
    />
  );
}
