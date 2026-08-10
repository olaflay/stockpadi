import { db } from "@/lib/db";
import type { StockMovement, AdjustmentReasonCode } from "@/types/stock-movement";
import { getCurrentStock } from "@/features/inventory/stock";
import { assertPermission } from "@/features/auth/assert-permission";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";

export interface StockAdjustmentPayload {
  id: string;
  clientId: string;
  branchId: string;
  productId: string;
  quantityDelta: number;
  reasonCode: AdjustmentReasonCode;
  note: string | null;
  createdAtLocal: string;
}

/**
 * A stock count never writes the counted quantity itself, only the delta
 * between it and the current computed stock, as a new "adjustment" ledger
 * row, per .agents/rules/offline-sync-and-ledger.md. Allowed offline: the
 * delta is computed from this device's own local ledger, no server round
 * trip is needed, per .agents/skills/add-stock-movement-type.md Step 4
 * ("decide its offline behavior explicitly"). Mirrors completeSale's
 * single-transaction, data-plus-outbox write shape.
 */
export async function writeStockAdjustment(params: {
  branchId: string;
  productId: string;
  countedQuantity: number;
  reasonCode: AdjustmentReasonCode;
  note: string | null;
  createdByUserId: string;
  actor: CurrentUser;
}): Promise<StockMovement> {
  await assertPermission(params.actor, "stock_adjustments");

  const now = new Date().toISOString();
  const adjustmentId = crypto.randomUUID();

  // getCurrentStock is read inside this transaction, not before it, so a
  // rapid double-tap firing this function twice before the disabling
  // re-render lands can't have both calls read the same stale baseline and
  // apply the correction delta twice.
  return db.transaction("rw", db.stockMovements, db.outbox, async () => {
    const currentStock = await getCurrentStock(params.productId, params.branchId);
    const quantityDelta = params.countedQuantity - currentStock;

    const movement: StockMovement = {
      id: crypto.randomUUID(),
      clientId: adjustmentId,
      branchId: params.branchId,
      productId: params.productId,
      quantityDelta,
      source: "adjustment",
      sourceReferenceId: adjustmentId,
      reasonCode: params.reasonCode,
      createdAtLocal: now,
      createdAt: now,
      createdByUserId: params.createdByUserId,
    };

    const payload: StockAdjustmentPayload = {
      id: adjustmentId,
      clientId: adjustmentId,
      branchId: params.branchId,
      productId: params.productId,
      quantityDelta,
      reasonCode: params.reasonCode,
      note: params.note,
      createdAtLocal: now,
    };

    await db.stockMovements.add(movement);
    await enqueueOutboxWrite(adjustmentId, "stock_adjustment", payload, now);

    return movement;
  });
}
