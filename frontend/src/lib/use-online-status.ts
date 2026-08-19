"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Drives the persistent offline banner every primary screen must show.
 * useSyncExternalStore keeps the server snapshot (always "online", the
 * server has no concept of connectivity) separate from the client snapshot,
 * avoiding the hydration mismatch a useState+useEffect version produces.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
