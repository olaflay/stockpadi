import { db } from "@/lib/db";

/**
 * Current stock is always computed from the ledger, never read from a
 * mutable field. See .agents/rules/offline-sync-and-ledger.md.
 */
export async function getCurrentStock(productId: string, branchId: string): Promise<number> {
  const movements = await db.stockMovements
    .where("productId")
    .equals(productId)
    .filter((m) => m.branchId === branchId)
    .toArray();

  return movements.reduce((total, m) => total + m.quantityDelta, 0);
}
