import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCurrentStock } from "@/features/inventory/stock";
import { mergeIncomingStockMovements } from "@/features/inventory/merge-stock-movements";
import type { StockMovement } from "@/types/stock-movement";

/**
 * The mandatory two-device concurrent-write test for the stock ledger.
 * See .agents/skills/write-offline-conflict-test.md and
 * .agents/rules/offline-sync-and-ledger.md: two offline sales of the same
 * item must both be honored, in either sync order, and a retried sync must
 * never double-count.
 */

const PRODUCT_ID = "product-1";
const BRANCH_ID = "branch-1";

function movement(overrides: Partial<StockMovement>): StockMovement {
  return {
    id: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    branchId: BRANCH_ID,
    productId: PRODUCT_ID,
    quantityDelta: 0,
    source: "sale",
    sourceReferenceId: null,
    reasonCode: null,
    createdAtLocal: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdByUserId: "user-1",
    ...overrides,
  };
}

describe("stock ledger: two-device concurrent sale", () => {
  beforeEach(async () => {
    await db.stockMovements.clear();
  });

  const seed = () =>
    movement({ clientId: "seed", quantityDelta: 1, source: "initial_stock" });

  const deviceASale = () =>
    movement({ clientId: "device-a-sale-1", quantityDelta: -1, sourceReferenceId: "sale-a" });

  const deviceBSale = () =>
    movement({ clientId: "device-b-sale-1", quantityDelta: -1, sourceReferenceId: "sale-b" });

  it("honors both sales when device A syncs before device B", async () => {
    await mergeIncomingStockMovements([seed()]);
    await mergeIncomingStockMovements([deviceASale()]);
    await mergeIncomingStockMovements([deviceBSale()]);

    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(-1);
  });

  it("honors both sales when device B syncs before device A (order must not change the result)", async () => {
    await mergeIncomingStockMovements([seed()]);
    await mergeIncomingStockMovements([deviceBSale()]);
    await mergeIncomingStockMovements([deviceASale()]);

    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(-1);
  });

  it("does not double-count a retried sync of the same movement", async () => {
    await mergeIncomingStockMovements([seed()]);
    await mergeIncomingStockMovements([deviceASale()]);
    await mergeIncomingStockMovements([deviceBSale()]);

    // Simulate a dropped connection during device A's upload, then a retry
    // of the exact same batch (same client_id).
    await mergeIncomingStockMovements([deviceASale()]);

    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(-1);
    const matchingMovements = await db.stockMovements.where("clientId").equals("device-a-sale-1").toArray();
    expect(matchingMovements).toHaveLength(1);
  });
});
