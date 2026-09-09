"use client";

import { useEffect } from "react";
import { drainOutbox, recoverStuckSyncingItems, recoverStaleSyncingItems } from "@/features/sync/drain-outbox";
import { preloadSessionData } from "@/features/sync/preload-session-data";

/**
 * Invisible. On boot and on reconnection: first recovers any outbox rows left
 * in the transient "syncing" state by a crash or a tab killed mid-drain, then
 * fires the outbox drain (in case the app opens already online with items
 * queued from a previous session).
 *
 * Additionally runs `preloadSessionData()` in the background to ensure all
 * cloud data (customers, products, branches, categories, purchases, expenses)
 * is cached into IndexedDB (Dexie) so subsequent page visits are instantaneous
 * and work completely offline without stalling the user.
 * See .agents/rules/offline-sync-and-ledger.md and PRD 10.1.
 */
export function SyncEngine() {
  useEffect(() => {
    const run = async () => {
      await recoverStaleSyncingItems();
      await recoverStuckSyncingItems();
      await drainOutbox();
      await preloadSessionData();
    };
    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);

  return null;
}
