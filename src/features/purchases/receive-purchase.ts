import { db } from "@/lib/db";
import type { Purchase, PurchaseItem } from "@/types/purchase";
import type { StockMovement } from "@/types/stock-movement";
import { assertPermission } from "@/features/auth/assert-permission";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";

export interface PurchaseLine {
  productId: string;
  quantity: number;
  unitCost: number;
}

/**
 * Restocking: the counterpart to completeSale, stock moves in rather than
 * out. Allowed offline — same as sales, unlike void/refund — since a
 * delivery can arrive while the shop's connection is down and the stock
 * still needs to be on the shelf immediately. See
 * .agents/skills/add-stock-movement-type.md and
 * .agents/rules/offline-sync-and-ledger.md. Purchases receive in the
 * product's base unit only (no alt-unit purchasing), matching
 * sync_apply_purchase_receipt server-side.
 */
export async function receivePurchase(params: {
  branchId: string;
  supplierId: string;
  lines: PurchaseLine[];
  createdByUserId: string;
  actor: CurrentUser;
}): Promise<Purchase> {
  await assertPermission(params.actor, "stock_adjustments");

  if (params.lines.length === 0) {
    throw new Error("A purchase needs at least one line item.");
  }

  const now = new Date().toISOString();
  const purchaseId = crypto.randomUUID();

  const items: PurchaseItem[] = params.lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCost: line.unitCost,
    movementClientId: crypto.randomUUID(),
  }));

  const purchase: Purchase = {
    id: purchaseId,
    clientId: purchaseId,
    branchId: params.branchId,
    supplierId: params.supplierId,
    items,
    createdAtLocal: now,
    createdAt: now,
    createdByUserId: params.createdByUserId,
  };

  const movements: StockMovement[] = items.map((item) => ({
    id: crypto.randomUUID(),
    clientId: item.movementClientId,
    branchId: params.branchId,
    productId: item.productId,
    quantityDelta: item.quantity,
    source: "purchase_receipt",
    sourceReferenceId: purchaseId,
    reasonCode: null,
    createdAtLocal: now,
    createdAt: now,
    createdByUserId: params.createdByUserId,
  }));

  await db.transaction("rw", db.purchases, db.stockMovements, db.outbox, async () => {
    await db.purchases.add(purchase);
    await db.stockMovements.bulkAdd(movements);
    await enqueueOutboxWrite(purchaseId, "purchase_receipt", purchase, now);
  });

  return purchase;
}
