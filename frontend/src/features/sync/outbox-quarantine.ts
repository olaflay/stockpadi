import { db, withDatabaseClosedRecovery, type SyncQuarantineRow } from "@/lib/db";
import type { SyncQueueItem } from "@/types/sync";

export interface QuarantinedItemView {
  id: string;
  businessId: string;
  clientId: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: string;
  item: SyncQueueItem | null;
}

/**
 * Quarantines a failing or poison-pill mutation so that it does not block
 * unrelated sales and stock movements from backing up.
 */
export async function quarantinePoisonPill(
  item: SyncQueueItem,
  reason = "Poison pill failure quarantined to prevent head-of-line blocking"
): Promise<void> {
  const quarantineRow: SyncQuarantineRow = {
    id: `quarantine:${item.clientId}`,
    businessId: item.businessId ?? "default",
    entity: item.type,
    entityId: item.entityId ?? item.clientId,
    record: item,
    reason,
    createdAt: new Date().toISOString(),
  };

  await withDatabaseClosedRecovery(() =>
    db.transaction("rw", db.outbox, db.syncQuarantine, async () => {
      await db.syncQuarantine.put(quarantineRow);
      // Mark as needs_review so the outbox drainer (which only drains pending/blocked)
      // skips this item without blocking independent sales.
      await db.outbox.update(item.clientId, {
        status: "needs_review",
        errorCode: "QUARANTINED_POISON_PILL",
        lastError: reason,
        lastErrorCode: "QUARANTINED_POISON_PILL",
        lastErrorMessage: reason,
        reconciliationStatus: "needs_review",
        reconciliationReason: reason,
      });
    })
  );
}

/**
 * Returns all currently quarantined items for a given business.
 */
export async function getQuarantinedItems(businessId: string): Promise<QuarantinedItemView[]> {
  const [quarantineRows, outboxRows] = await Promise.all([
    db.syncQuarantine.where("businessId").equals(businessId).toArray(),
    db.outbox.where("businessId").equals(businessId).toArray(),
  ]);

  const outboxMap = new Map(outboxRows.map((o) => [o.clientId, o]));

  return quarantineRows.map((row) => ({
    id: row.id,
    businessId: row.businessId,
    clientId: (row.record as SyncQueueItem)?.clientId ?? row.entityId,
    entityType: row.entity,
    entityId: row.entityId,
    reason: row.reason,
    createdAt: row.createdAt,
    item: outboxMap.get((row.record as SyncQueueItem)?.clientId ?? row.entityId) ?? (row.record as SyncQueueItem) ?? null,
  }));
}

/**
 * Restores a quarantined item back to pending for manual retry if requested.
 */
export async function retryQuarantinedItem(clientId: string): Promise<void> {
  await withDatabaseClosedRecovery(() =>
    db.transaction("rw", db.outbox, db.syncQuarantine, async () => {
      await db.syncQuarantine.delete(`quarantine:${clientId}`);
      const item = await db.outbox.get(clientId);
      if (item) {
        await db.outbox.update(clientId, {
          status: "pending",
          errorCode: null,
          lastError: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          attemptCount: 0,
          nextAttemptAt: null,
        });
      }
    })
  );
}
