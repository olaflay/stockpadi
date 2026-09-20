import { db } from "@/lib/db";
import type { Purchase, PurchaseItem } from "@/types/purchase";
import type { StockMovement } from "@/types/stock-movement";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId, withLocalBusinessIds } from "@/lib/local-tenant";
import { assertHighRiskWriteAllowed } from "@/features/sync/sync-safety";
import { assertCapability } from "@/features/auth/authorization";

export interface PurchaseLine {
  productId: string;
  quantity: number;
  unitCost: number;
}

/**
 * Restocking: the counterpart to completeSale, stock moves in rather than
 * out. The local purchase, stock ledger movements, and outbox mutation are
 * committed together in both online and offline states, so reconnect uses
 * the same idempotent sync path. See
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
  assertCapability(params.actor, "RECEIVE_STOCK");
  await assertHighRiskWriteAllowed("purchase_receipt");
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
    const tenantPurchase = await withLocalBusinessId(purchase);
    await db.purchases.add(tenantPurchase);
    await db.stockMovements.bulkAdd(await withLocalBusinessIds(movements));
    await enqueueOutboxWrite(purchaseId, "purchase_receipt", tenantPurchase, now);
  });

  return purchase;
}
