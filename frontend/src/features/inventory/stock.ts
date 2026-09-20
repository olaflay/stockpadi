import { db } from "@/lib/db";
import { getLocalBusinessId, isLocalTenantRow, matchesActiveTenant } from "@/lib/local-tenant";

/**
 * Current stock is always computed from the ledger, never read from a
 * mutable field. See .agents/rules/offline-sync-and-ledger.md.
 */
export async function getCurrentStock(productId: string, branchId: string): Promise<number> {
  const businessId = await getLocalBusinessId();
  const movements = await db.stockMovements
    .where("productId")
    .equals(productId)
    .filter((m) => m.branchId === branchId && (businessId ? isLocalTenantRow(m, businessId) : true))
    .toArray();

  if (businessId && db.tables.some((table) => table.name === "inventoryStock")) {
    const projection = await db.inventoryStock.get(`${businessId}:${productId}:${branchId}`);
    if (projection) {
      const pendingMovementIds = await getPendingStockMovementIds();
      return projection.quantity + movements
        .filter((movement) => pendingMovementIds.has(movement.clientId))
        .reduce((total, movement) => total + movement.quantityDelta, 0);
    }
  }

  return movements.reduce((total, m) => total + m.quantityDelta, 0);
}

export async function getPendingStockMovementIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const rows = await db.outbox.toArray();
  for (const row of rows.filter(matchesActiveTenant)) {
    if (!["pending", "syncing", "blocked", "failed", "conflict"].includes(row.status)) continue;
    if (row.type === "sale" || row.type === "purchase_receipt") {
      const items = (row.payload as { items?: Array<{ movementClientId?: unknown }> }).items;
      for (const item of items ?? []) if (typeof item.movementClientId === "string") ids.add(item.movementClientId);
    } else if (row.type === "stock_adjustment" || row.type === "stock_count_submission") {
      const payload = row.payload as { clientId?: unknown; id?: unknown };
      const id = payload.clientId ?? payload.id;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

