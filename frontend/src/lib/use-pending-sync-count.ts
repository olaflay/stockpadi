"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";

/** Count of outbox items not yet confirmed synced, including blocked retries. */
export function usePendingSyncCount(): number {
  const count = useLiveQuery(
    async () => (await tenantArray(db.outbox.where("status").anyOf("pending", "syncing", "blocked"))).length,
    [],
    0
  );
  return count ?? 0;
}

/** Count of outbox items the server rejected, drives the retry indicator. */
export function useFailedSyncCount(): number {
  const count = useLiveQuery(async () => (await tenantArray(db.outbox.where("status").anyOf("failed", "conflict"))).length, [], 0);
  return count ?? 0;
}
