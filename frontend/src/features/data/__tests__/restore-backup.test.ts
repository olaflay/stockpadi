import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";
import {
  UnsyncedBackupRestoreBlocked,
  countUnsyncedOutbox,
  restoreBackup,
} from "@/features/data/restore-backup";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";
import type { SyncQueueItem } from "@/types/sync";

const BUSINESS_ID = "test-business";

function queueItem(
  overrides: Partial<SyncQueueItem> & Pick<SyncQueueItem, "clientId" | "status">
): SyncQueueItem {
  return {
    type: "sale",
    entityId: "s1",
    payload: {},
    attemptCount: 0,
    lastError: null,
    createdAtLocal: "2026-03-01T10:00:00.000Z",
    businessId: BUSINESS_ID,
    sequence: 1,
    ...overrides,
  } as SyncQueueItem;
}

function saleRow(id: string, total: number): Sale {
  return {
    id,
    clientId: `client-${id}`,
    businessId: BUSINESS_ID,
    branchId: "br1",
    customerId: null,
    items: [],
    payments: [],
    subtotal: total,
    discount: 0,
    total,
    createdAtLocal: "2026-03-01T10:00:00.000Z",
    createdAt: "2026-03-01T10:00:00.000Z",
    voidedAt: null,
  } as unknown as Sale;
}

function productRow(id: string, name: string): Product {
  return { id, businessId: BUSINESS_ID, name } as unknown as Product;
}

/** A backup taken at T1: one sale, one product. */
function backupAtT1() {
  return {
    businessProfile: [{ id: BUSINESS_ID, businessName: "Test Shop" }],
    branches: [{ id: "br1", businessId: BUSINESS_ID, name: "Main" }],
    products: [productRow("p1", "Widget")],
    categories: [],
    customers: [],
    customerCreditMovements: [],
    stockMovements: [{ id: "mv1", businessId: BUSINESS_ID, productId: "p1", delta: -10 }],
    sales: [saleRow("sale-t1", 1500)],
    expenses: [],
    suppliers: [],
    purchases: [],
  };
}

/** The shop sold more AFTER the backup was taken; those sales are still queued. */
async function seedDeviceAtT2() {
  await db.sales.bulkAdd([saleRow("sale-t2-a", 3000), saleRow("sale-t2-b", 3000)]);
  await db.products.bulkAdd([productRow("p1", "Widget"), productRow("p-new", "Added after backup")]);
  await db.outbox.bulkAdd([
    queueItem({ clientId: "q1", status: "pending", entityId: "sale-t2-a" }),
    queueItem({ clientId: "q2", status: "blocked", entityId: "sale-t2-b", attemptCount: 3 }),
  ]);
}

describe("backup restore must not desynchronise the outbox from the ledger", () => {
  beforeEach(async () => {
    await setLocalBusinessId(BUSINESS_ID);
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it("counts every queued mutation a restore would strand", async () => {
    await db.outbox.bulkAdd([
      queueItem({ clientId: "q1", status: "pending" }),
      queueItem({ clientId: "q2", status: "syncing" }),
      queueItem({ clientId: "q3", status: "blocked" }),
      queueItem({ clientId: "q4", status: "failed" }),
      queueItem({ clientId: "q5", status: "conflict" }),
    ]);

    expect(await countUnsyncedOutbox(BUSINESS_ID)).toBe(5);
  });

  it("refuses to restore while changes are unsynced", async () => {
    await seedDeviceAtT2();

    await expect(
      restoreBackup(backupAtT1(), { businessId: BUSINESS_ID, discardOutbox: false })
    ).rejects.toBeInstanceOf(UnsyncedBackupRestoreBlocked);

    // Nothing was touched: the refusal happens before the transaction opens.
    expect((await db.sales.toArray()).map((s) => s.id).sort()).toEqual(["sale-t2-a", "sale-t2-b"]);
    expect(await db.outbox.count()).toBe(2);
  });

  it("blocks even for a single unsynced change, naming the count", async () => {
    await db.outbox.add(queueItem({ clientId: "q1", status: "failed" }));

    await expect(
      restoreBackup(backupAtT1(), { businessId: BUSINESS_ID, discardOutbox: false })
    ).rejects.toThrow(/1 change on this device has not synced yet/);
  });

  it("clears the queue in the same transaction when the operator opts to discard", async () => {
    await seedDeviceAtT2();

    const result = await restoreBackup(backupAtT1(), {
      businessId: BUSINESS_ID,
      discardOutbox: true,
    });

    expect(result.discardedOutboxCount).toBe(2);
    // Ledger and queue are now the same timeline: both at T1.
    expect((await db.sales.toArray()).map((s) => s.id)).toEqual(["sale-t1"]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("leaves no T2 product row behind when it discards the queue", async () => {
    await seedDeviceAtT2();

    await restoreBackup(backupAtT1(), { businessId: BUSINESS_ID, discardOutbox: true });

    expect((await db.products.toArray()).map((p) => p.id)).toEqual(["p1"]);
  });

  it("allows a clean restore when the queue is already empty", async () => {
    await db.products.add(productRow("p-stale", "Deleted long ago"));
    await db.sales.add(saleRow("sale-old", 100));

    const result = await restoreBackup(backupAtT1(), {
      businessId: BUSINESS_ID,
      discardOutbox: false,
    });

    expect(result.discardedOutboxCount).toBe(0);
    expect((await db.sales.toArray()).map((s) => s.id)).toEqual(["sale-t1"]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("ignores another tenant's queue when deciding to block", async () => {
    await db.outbox.add(
      queueItem({ clientId: "other", status: "pending", businessId: "some-other-shop" })
    );

    expect(await countUnsyncedOutbox(BUSINESS_ID)).toBe(0);
    await expect(
      restoreBackup(backupAtT1(), { businessId: BUSINESS_ID, discardOutbox: false })
    ).resolves.toMatchObject({ discardedOutboxCount: 0 });
  });

  it("keeps another tenant's queue intact when discarding", async () => {
    await db.outbox.bulkAdd([
      queueItem({ clientId: "mine", status: "pending" }),
      queueItem({ clientId: "other", status: "pending", businessId: "some-other-shop" }),
    ]);

    await restoreBackup(backupAtT1(), { businessId: BUSINESS_ID, discardOutbox: true });

    expect((await db.outbox.toArray()).map((r) => r.clientId)).toEqual(["other"]);
  });
});