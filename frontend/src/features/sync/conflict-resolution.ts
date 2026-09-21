import { db } from "@/lib/db";
import type { SyncQueueItem } from "@/types/sync";

/** Only snapshot entities can be safely discarded or deliberately rebased.
 * Ledger events represent money/stock history and must be corrected with a
 * new event, never silently removed from the queue. */
const REBASABLE_TYPES = new Set(["product", "customer", "supplier", "branch", "category"]);

export function canResolveConflictInPlace(item: SyncQueueItem): boolean {
  return item.status === "conflict" && REBASABLE_TYPES.has(item.type);
}

/**
 * The owner has explicitly chosen the cloud copy. Remove only the rejected
 * local snapshot and restart the cursor so the full authoritative record is
 * downloaded. No products, inventory rows, or ledger history are cleared.
 */
export async function discardConflictingSnapshot(item: SyncQueueItem): Promise<void> {
  if (!canResolveConflictInPlace(item) || !item.businessId) {
    throw new Error("Only a conflicting catalogue change can be discarded.");
  }

  const stateId = `${item.businessId}:session`;
  await db.transaction("rw", db.outbox, db.syncPullState, async () => {
    await db.outbox.delete(item.clientId);
    const state = await db.syncPullState.get(stateId);
    if (state) {
      // This is intentionally a re-read, not a cache reset. The next complete
      // pull merges the authoritative row into the existing local database.
      await db.syncPullState.update(stateId, {
        cursor: null,
        nextPullAttemptAt: null,
        lastFailedDataset: null,
      });
    }
  });
}
