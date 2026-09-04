"use client";

import { useEffect } from "react";
import { drainOutbox, recoverStuckSyncingItems, recoverStaleSyncingItems } from "@/features/sync/drain-outbox";

/**
 * Invisible. On boot and on reconnection: first recovers any outbox rows left
 * in the transient "syncing" state by a crash or a tab killed mid-drain, then
 * fires the outbox drain (in case the app opens already online with items
 * queued from a previous session). See .agents/rules/offline-sync-and-ledger.md
 * and PRD 10.1.
 *
 * Also runs a stale-syncing sweeper on boot: items stuck in "syncing" for
 * longer than 30 seconds are reverted to "pending" automatically.
 */
export function SyncEngine() {
  useEffect(() => {
    const run = async () => {
      await recoverStaleSyncingItems();
      await recoverStuckSyncingItems();
      await drainOutbox();
    };
    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, []);

  return null;
}
