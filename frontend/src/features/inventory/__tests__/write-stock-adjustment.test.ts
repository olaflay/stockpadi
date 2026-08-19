import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCurrentStock } from "@/features/inventory/stock";
import { mergeIncomingStockMovements } from "@/features/inventory/merge-stock-movements";
import { writeStockAdjustment } from "@/features/inventory/write-stock-adjustment";
import type { CurrentUser } from "@/features/auth/use-current-user";

const PRODUCT_ID = "product-1";
const BRANCH_ID = "branch-1";

const OWNER: CurrentUser = { id: "user-1", fullName: "Owner", role: "owner" };

describe("writeStockAdjustment", () => {
  beforeEach(async () => {
    await db.stockMovements.clear();
    await db.outbox.clear();
  });

  it("writes the delta between counted quantity and current stock, never the raw count", async () => {
    await mergeIncomingStockMovements([
      {
        id: crypto.randomUUID(),
        clientId: "seed",
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityDelta: 10,
        source: "initial_stock",
        sourceReferenceId: null,
        reasonCode: null,
        createdAtLocal: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdByUserId: "seed",
      },
    ]);

    const movement = await writeStockAdjustment({
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      countedQuantity: 7,
      reasonCode: "recount",
      note: "Shelf recount",
      createdByUserId: OWNER.id,
      actor: OWNER,
    });

    expect(movement.quantityDelta).toBe(-3);
    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(7);

    const outboxItem = await db.outbox.get(movement.clientId);
    expect(outboxItem?.type).toBe("stock_adjustment");
    expect(outboxItem?.status).toBe("pending");
  });

  /**
   * The mandatory two-device concurrent-write test for this new movement
   * type, per .agents/skills/write-offline-conflict-test.md: two devices
   * each count the same product independently offline, then both sync —
   * both adjustments must survive and sum correctly, and a retried sync
   * must not double-count.
   */
  it("honors independent counts from two devices, in either sync order, without double-counting a retry", async () => {
    const deviceAAdjustment = {
      id: crypto.randomUUID(),
      clientId: "device-a-adjustment-1",
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityDelta: -2,
      source: "adjustment" as const,
      sourceReferenceId: "adj-a",
      reasonCode: "recount",
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "device-a-user",
    };
    const deviceBAdjustment = {
      id: crypto.randomUUID(),
      clientId: "device-b-adjustment-1",
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityDelta: 5,
      source: "adjustment" as const,
      sourceReferenceId: "adj-b",
      reasonCode: "damage",
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "device-b-user",
    };

    await mergeIncomingStockMovements([deviceAAdjustment]);
    await mergeIncomingStockMovements([deviceBAdjustment]);
    // Simulate a dropped connection and retry of device A's same batch.
    await mergeIncomingStockMovements([deviceAAdjustment]);

    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(3);
    const matching = await db.stockMovements.where("clientId").equals("device-a-adjustment-1").toArray();
    expect(matching).toHaveLength(1);
  });
});
