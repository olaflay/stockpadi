import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import type { SyncEntityType } from "@/types/sync";
import {
  SYNC_REQUIRED_ABSOLUTE_QUEUE_LIMIT,
  SYNC_REQUIRED_MAX_AGE_MS,
  SYNC_REQUIRED_QUEUE_THRESHOLD,
} from "@/config/limits";

/** A long-stalled, large queue is a business-risk signal, not a reason to
 * make the app unusable. View and sync remain available; high-risk writes are
 * paused until the queue is brought down. */
export const HIGH_RISK_SYNC_ENTITY_TYPES = new Set<SyncEntityType>([
  "sale", "stock_adjustment", "stock_count_submission", "purchase_receipt", "credit_payment", "expense", "expense_reversal",
]);
const UNSYNCED_STATUSES = ["pending", "syncing", "blocked", "failed", "conflict", "needs_review"] as const;

export interface SyncSafety {
  required: boolean;
  queueCount: number;
  oldestPendingAt: string | null;
  ageMs: number;
}

export async function getSyncSafety(): Promise<SyncSafety> {
  const businessId = await getLocalBusinessId();
  if (!businessId) return { required: false, queueCount: 0, oldestPendingAt: null, ageMs: 0 };
  // High-risk writes call this check before entering their local transaction.
  // Use the status index instead of decoding every historical outbox row, and
  // find the oldest timestamp in one pass rather than sorting the whole queue.
  const rows = (await db.outbox.where("status").anyOf(...UNSYNCED_STATUSES).toArray())
    .filter((row) => row.businessId === businessId);
  let oldestPendingAt: string | null = null;
  for (const row of rows) {
    if (row.createdAtLocal && (oldestPendingAt === null || row.createdAtLocal < oldestPendingAt)) {
      oldestPendingAt = row.createdAtLocal;
    }
  }
  const ageMs = oldestPendingAt ? Math.max(0, Date.now() - new Date(oldestPendingAt).getTime()) : 0;
  return {
    required:
      rows.length >= SYNC_REQUIRED_ABSOLUTE_QUEUE_LIMIT ||
      (rows.length >= SYNC_REQUIRED_QUEUE_THRESHOLD && ageMs >= SYNC_REQUIRED_MAX_AGE_MS),
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
