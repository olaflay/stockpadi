import { db } from "@/lib/db";

/**
 * Restoring a backup replaces this device's copy of the shop's data wholesale.
 * That is only coherent if the device's pending sync queue is empty, because the
 * outbox is not part of a backup: it holds mutations made AFTER the backup was
 * taken, each referencing rows by id.
 *
 * Restoring with a non-empty queue therefore mixes two timelines. The sales and
 * stock_movements tables are reverted to time T1 while T2 mutations referencing
 * T1-era product and branch ids are still queued, and the next drain pushes
 * them. Rows that the backup no longer contains can never be applied, so those
 * items retry forever, and any that do apply land against a ledger the operator
 * believes they just rolled back.
 *
 * Both available resolutions are explicit and neither loses money silently:
 *   - sync first, which is always satisfiable, or
 *   - discard the queue, which the caller must opt into and which is reported
 *     back so the operator learns exactly how many changes were dropped.
 * Discarding is included because a queue containing permanently rejected items
 * can never drain, and without it such a device could never restore at all.
 */

export const RESTORED_TABLES = [
  "businessProfile",
  "branches",
  "products",
  "categories",
  "customers",
  "customerCreditMovements",
  "stockMovements",
  "sales",
  "expenses",
  "suppliers",
  "purchases",
] as const;

export class UnsyncedBackupRestoreBlocked extends Error {
  constructor(readonly unsyncedCount: number) {
    const count = `${unsyncedCount} change${unsyncedCount === 1 ? "" : "s"}`;
    const verb = unsyncedCount === 1 ? "has" : "have";
    super(
      `Restore blocked: ${count} on this device ${verb} not synced yet. ` +
        `Sync first, or restore and discard that ${count}.`
    );
    this.name = "UnsyncedBackupRestoreBlocked";
  }
}

export interface RestoreResult {
  discardedOutboxCount: number;
}

/**
 * Counts queued mutations a restore would desynchronise from the ledger.
 *
 * Every row still present in the outbox is unsynced work by construction:
 * drain-outbox deletes a row once the server acknowledges it, so an acked item
 * is never left behind and there is no completed status to filter out. A
 * non-empty outbox therefore means unsynced work, full stop.
 */
export async function countUnsyncedOutbox(businessId: string): Promise<number> {
  return db.outbox.where("businessId").equals(businessId).count();
}

export async function restoreBackup(
  data: Record<string, unknown>,
  options: { businessId: string; discardOutbox: boolean }
): Promise<RestoreResult> {
  const unsynced = await countUnsyncedOutbox(options.businessId);
  if (unsynced > 0 && !options.discardOutbox) {
    throw new UnsyncedBackupRestoreBlocked(unsynced);
  }

  // db.outbox is inside the transaction on purpose: the queue and the ledger it
  // describes must be replaced or cleared together, never one without the other.
  await db.transaction("rw", [...RESTORED_TABLES, "outbox"], async () => {
    if (options.discardOutbox) {
      await db.outbox
        .where("businessId")
        .equals(options.businessId)
        .delete();
    }
    for (const table of RESTORED_TABLES) {
      const rows = data[table];
      if (!Array.isArray(rows) && typeof rows !== "object") continue;
      const target = db.table(table);
      await target.clear();
      if (Array.isArray(rows) && rows.length > 0) await target.bulkPut(rows);
    }
  });

  return { discardedOutboxCount: options.discardOutbox ? unsynced : 0 };
}