import { db } from "@/lib/db";
import type { StockMovement, AdjustmentReasonCode } from "@/types/stock-movement";
import { getCurrentStock } from "@/features/inventory/stock";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";
import { serverPost, NetworkUnavailableError, BackendConfigurationError } from "@/features/operations/server-client";

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
      ...(params.actor.accountType === "WORKER" ? { countedQuantity: params.countedQuantity } : {}),
    };

    const tenantPayload = await withLocalBusinessId(payload);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        await serverPost(params.actor.accountType === "WORKER" ? "/api/inventory/stock-count" : "/api/inventory/adjust", tenantPayload);
        return params.actor.accountType === "WORKER" ? { ...movement, quantityDelta: 0 } : movement;
      } catch (error) {
        if (
          !(error instanceof NetworkUnavailableError) &&
          !(error instanceof BackendConfigurationError)
        ) {
          throw error;
        }
      }
    }
    if (params.actor.accountType === "WORKER") {
      await enqueueOutboxWrite(adjustmentId, "stock_count_submission", tenantPayload, now);
      return { ...movement, quantityDelta: 0 };
    }
    const tenantMovement = await withLocalBusinessId(movement);
    await db.stockMovements.add(tenantMovement);
    await enqueueOutboxWrite(adjustmentId, "stock_adjustment", tenantPayload, now);

    return tenantMovement;
  });
}
