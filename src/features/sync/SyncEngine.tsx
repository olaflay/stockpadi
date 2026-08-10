"use client";

import { useEffect } from "react";
import { drainOutbox } from "@/features/sync/drain-outbox";

/**
 * Invisible. Fires the outbox drain on boot (in case the app opens already
 * online with items queued from a previous session) and whenever the device
 * reconnects. See .agents/rules/offline-sync-and-ledger.md and PRD 10.1.
 */
export function SyncEngine() {
  useEffect(() => {
    void drainOutbox();
    window.addEventListener("online", drainOutbox);
    return () => window.removeEventListener("online", drainOutbox);
  }, []);

  return null;
}
