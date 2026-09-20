import { db } from "@/lib/db";
import type { StockMovement, AdjustmentReasonCode } from "@/types/stock-movement";
import { getCurrentStock } from "@/features/inventory/stock";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";
import { assertHighRiskWriteAllowed } from "@/features/sync/sync-safety";
import { assertCapability, hasCapability } from "@/features/auth/authorization";

export interface StockAdjustmentPayload {
  businessId?: string;
  id: string;
  clientId: string;
  branchId: string;
  productId: string;
  quantityDelta: number;
  reasonCode: AdjustmentReasonCode;
  note: string | null;
  createdAtLocal: string;
  countedQuantity?: number;
}

/**
 * A stock count never writes the counted quantity itself, only the delta
 * between it and the current computed stock, as a new "adjustment" ledger
 * row, per .agents/rules/offline-sync-and-ledger.md. The delta is computed
 * from this device's own local ledger, then the local movement and outbox
 * mutation are committed together. The same path is used online and offline
 * so there is one retry/idempotency authority.
 */
export async function writeStockAdjustment(params: {
  branchId: string;
  productId: string;
  countedQuantity: number;
  reasonCode: AdjustmentReasonCode;
  note: string | null;
  createdByUserId: string;
  actor: CurrentUser;
  operation?: "stock_count" | "adjustment";
}): Promise<StockMovement> {
  const operation = params.operation ?? (
    params.actor.accountType === "WORKER" && !hasCapability(params.actor, "ADJUST_STOCK") ? "stock_count" : "adjustment"
  );
  assertCapability(params.actor, operation === "stock_count" ? "SUBMIT_STOCK_COUNT" : "ADJUST_STOCK");
  await assertHighRiskWriteAllowed(operation === "stock_count" ? "stock_count_submission" : "stock_adjustment");
  const now = new Date().toISOString();
  const adjustmentId = crypto.randomUUID();

  // getCurrentStock is read inside this transaction, not before it, so a
  // rapid double-tap firing this function twice before the disabling
  // re-render lands can't have both calls read the same stale baseline and
  // apply the correction delta twice.
  return db.transaction("rw", db.stockMovements, db.outbox, db.inventoryStock, async () => {
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
      ...(params.actor.accountType === "WORKER" ? { countedQuantity: params.countedQuantity } : {}),
    };

    const tenantPayload = await withLocalBusinessId(payload);
    const tenantMovement = await withLocalBusinessId(movement);
    if (operation === "stock_count") {
      await enqueueOutboxWrite(adjustmentId, "stock_count_submission", tenantPayload, now);
      return { ...movement, quantityDelta: 0 };
    }
    await db.stockMovements.add(tenantMovement);
    await enqueueOutboxWrite(adjustmentId, "stock_adjustment", tenantPayload, now);

    return tenantMovement;
  });
}
