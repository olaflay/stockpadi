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
  "saleRefunds",
] as const;

const TENANT_TABLES = RESTORED_TABLES.filter((table) => table !== "businessProfile");

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(`Backup validation failed: ${message}`);
    this.name = "InvalidBackupError";
  }
}

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

  const rowsByTable = new Map<string, unknown[]>();
  for (const table of RESTORED_TABLES) {
    const raw = data[table];
    const rows = raw === undefined && table === "customerCreditMovements"
      ? data.creditMovements
      : raw;
    if (table === "businessProfile" && rows && !Array.isArray(rows)) {
      rowsByTable.set(table, [rows]);
      continue;
    }
    if (rows === undefined) {
      rowsByTable.set(table, []);
      continue;
    }
    if (!Array.isArray(rows)) throw new InvalidBackupError(`${table} must be an array`);
    rowsByTable.set(table, rows);
  }
  validateBackupRows(rowsByTable, options.businessId);

  // db.outbox is inside the transaction on purpose: the queue and the ledger it
  // describes must be replaced or cleared together, never one without the other.
  await db.transaction("rw", [...RESTORED_TABLES, "outbox"], async () => {
    if (options.discardOutbox) {
      await db.outbox
        .where("businessId")
        .equals(options.businessId)
        .delete();
    }
    for (const table of TENANT_TABLES) {
      const target = db.table(table);
      await target.where("businessId").equals(options.businessId).delete();
      const rows = rowsByTable.get(table) ?? [];
      if (rows.length > 0) await target.bulkPut(rows);
    }
    // businessProfile is a singleton cache, not a tenant ledger table. It may
    // be updated for the selected tenant, but never causes another tenant's
    // business rows to be deleted.
    const profile = rowsByTable.get("businessProfile")?.[0] as Record<string, unknown> | undefined;
    if (profile) {
      const normalizedProfile = {
        ...profile,
        id: "singleton",
        businessId: options.businessId,
      };
      await db.businessProfile.put(normalizedProfile as never);
    }
  });

  return { discardedOutboxCount: options.discardOutbox ? unsynced : 0 };
}

function validateBackupRows(rowsByTable: Map<string, unknown[]>, businessId: string): void {
  const ids = new Map<string, Set<string>>();
  for (const table of TENANT_TABLES) {
    const seen = new Set<string>();
    ids.set(table, seen);
    for (const row of rowsByTable.get(table) ?? []) {
      if (!row || typeof row !== "object") throw new InvalidBackupError(`${table} contains a non-object row`);
      const record = row as Record<string, unknown>;
      if (typeof record.id !== "string" || !record.id.trim()) throw new InvalidBackupError(`${table} contains a row without an id`);
      if (seen.has(record.id)) throw new InvalidBackupError(`${table} contains duplicate id ${record.id}`);
      seen.add(record.id);
      if (record.businessId !== businessId) throw new InvalidBackupError(`${table} contains a row owned by another business`);
    }
  }

  const branches = ids.get("branches")!;
  const products = ids.get("products")!;
  const customers = ids.get("customers")!;
  const suppliers = ids.get("suppliers")!;
  const sales = ids.get("sales")!;
  const checkBranch = (record: Record<string, unknown>) => {
    if (record.branchId !== null && record.branchId !== undefined && !branches.has(String(record.branchId))) throw new InvalidBackupError("record references a branch outside the backup");
  };
  for (const row of rowsByTable.get("stockMovements") ?? []) {
    const record = row as Record<string, unknown>;
    checkBranch(record);
    if (!products.has(String(record.productId))) throw new InvalidBackupError("stock movement references a missing product");
    const quantity = record.quantityDelta ?? record.delta;
    if (typeof quantity !== "number" || !Number.isFinite(quantity)) throw new InvalidBackupError("stock movement has an invalid quantity delta");
  }
  for (const row of rowsByTable.get("sales") ?? []) {
    const record = row as Record<string, unknown>;
    checkBranch(record);
    if (record.customerId && !customers.has(String(record.customerId))) throw new InvalidBackupError("sale references a missing customer");
    if (!Array.isArray(record.items) || !Array.isArray(record.payments)) throw new InvalidBackupError("sale has invalid line or payment arrays");
    const lineTotal = record.items.reduce((sum: number, item: Record<string, unknown>) => {
      if (!products.has(String(item.productId)) || Number(item.quantity) <= 0) throw new InvalidBackupError("sale has an invalid product line");
      return sum + Number(item.unitPrice) * Number(item.quantity) - Number(item.discount ?? 0) * Number(item.quantity);
    }, 0);
    if (!Number.isFinite(Number(record.total)) || Math.abs(lineTotal - Number(record.total) - Number(record.discount ?? 0)) > 0.01 && record.items.length > 0) {
      throw new InvalidBackupError("sale line totals do not reconcile");
    }
  }
  for (const row of rowsByTable.get("customerCreditMovements") ?? []) {
    const record = row as Record<string, unknown>;
    if (!customers.has(String(record.customerId)) || typeof record.amountDelta !== "number" || !Number.isFinite(record.amountDelta)) throw new InvalidBackupError("credit ledger row is invalid");
  }
  for (const row of rowsByTable.get("purchases") ?? []) {
    const record = row as Record<string, unknown>;
    checkBranch(record);
    if (!suppliers.has(String(record.supplierId)) || !Array.isArray(record.items)) throw new InvalidBackupError("purchase relationship is invalid");
    for (const item of record.items as Array<Record<string, unknown>>) {
      if (!products.has(String(item.productId)) || Number(item.quantity) <= 0 || Number(item.unitCost) < 0) throw new InvalidBackupError("purchase line is invalid");
    }
  }
  for (const row of rowsByTable.get("saleRefunds") ?? []) {
    const record = row as Record<string, unknown>;
    checkBranch(record);
    if (!sales.has(String(record.saleId)) || Number(record.totalRefunded) <= 0 || !Array.isArray(record.items) || !Array.isArray(record.payments)) throw new InvalidBackupError("refund relationship or amount is invalid");
  }
  const profile = rowsByTable.get("businessProfile")?.[0] as Record<string, unknown> | undefined;
  if (profile?.businessId !== undefined && profile.businessId !== businessId) throw new InvalidBackupError("business profile belongs to another business");
}
