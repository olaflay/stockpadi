"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";

/** Count of outbox items not yet confirmed synced, drives the sync-in-progress indicator. */
export function usePendingSyncCount(): number {
  const count = useLiveQuery(
    async () => (await tenantArray(db.outbox.where("status").anyOf("pending", "syncing"))).length,
    [],
    0
  );
  return count ?? 0;
}

/** Count of outbox items the server rejected, drives the retry indicator. */
export function useFailedSyncCount(): number {
  const count = useLiveQuery(async () => (await tenantArray(db.outbox.where("status").equals("failed"))).length, [], 0);
  return count ?? 0;
}
