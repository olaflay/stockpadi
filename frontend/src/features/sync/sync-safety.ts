import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import type { SyncEntityType } from "@/types/sync";
import { SYNC_REQUIRED_MAX_AGE_MS, SYNC_REQUIRED_QUEUE_THRESHOLD } from "@/config/limits";

/** A long-stalled, large queue is a business-risk signal, not a reason to
 * make the app unusable. View and sync remain available; high-risk writes are
 * paused until the queue is brought down. */
export const HIGH_RISK_SYNC_ENTITY_TYPES = new Set<SyncEntityType>([
  "sale", "stock_adjustment", "stock_count_submission", "purchase_receipt", "credit_payment", "expense",
]);
const UNSYNCED_STATUSES = new Set(["pending", "syncing", "blocked", "failed", "conflict"]);

export interface SyncSafety {
  required: boolean;
  queueCount: number;
  oldestPendingAt: string | null;
  ageMs: number;
}

export async function getSyncSafety(): Promise<SyncSafety> {
  const businessId = await getLocalBusinessId();
  if (!businessId) return { required: false, queueCount: 0, oldestPendingAt: null, ageMs: 0 };
  const rows = (await db.outbox.toArray()).filter((row) => row.businessId === businessId && UNSYNCED_STATUSES.has(row.status));
  const oldestPendingAt = rows
    .map((row) => row.createdAtLocal)
    .filter(Boolean)
    .sort()[0] ?? null;
  const ageMs = oldestPendingAt ? Math.max(0, Date.now() - new Date(oldestPendingAt).getTime()) : 0;
  return {
    required: rows.length >= SYNC_REQUIRED_QUEUE_THRESHOLD && ageMs >= SYNC_REQUIRED_MAX_AGE_MS,
    queueCount: rows.length,
    oldestPendingAt,
    ageMs,
  };
}

export async function assertHighRiskWriteAllowed(type: SyncEntityType): Promise<void> {
  if (!HIGH_RISK_SYNC_ENTITY_TYPES.has(type)) return;
  const safety = await getSyncSafety();
  if (safety.required) {
    throw new Error(`SYNC_REQUIRED: ${safety.queueCount} changes have been waiting since ${safety.oldestPendingAt ?? "yesterday"}. Sync before recording another high-risk operation.`);
  }
}
