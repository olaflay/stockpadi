"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";

const ACTIVE_OUTBOX_STATUSES = ["pending", "syncing", "blocked", "failed", "conflict", "needs_review"] as const;

/** Count of outbox items not yet confirmed synced, including recoverable failures. */
export function usePendingSyncCount(): number {
  const count = useLiveQuery(
    async () => (await tenantArray(db.outbox.where("status").anyOf(...ACTIVE_OUTBOX_STATUSES))).length,
    [],
    0
  );
  return count ?? 0;
}

/** Count of sales waiting for upload or owner review. */
export function usePendingSalesCount(): number {
  const count = useLiveQuery(
    async () => (await tenantArray(db.outbox.where("type").equals("sale")))
      .filter((item) => ACTIVE_OUTBOX_STATUSES.includes(item.status as (typeof ACTIVE_OUTBOX_STATUSES)[number])).length,
    [],
    0
  );
  return count ?? 0;
}

/** Count of outbox items the server rejected, drives the retry indicator. */
export function useFailedSyncCount(): number {
  const count = useLiveQuery(async () => (await tenantArray(db.outbox.where("status").anyOf("failed", "conflict", "needs_review"))).length, [], 0);
  return count ?? 0;
}
