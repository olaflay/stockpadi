import { db } from "@/lib/db";
import type { StockMovement } from "@/types/stock-movement";

/**
 * Idempotent merge for stock movements arriving from sync (another device's
 * sale, or this device's own optimistic write being echoed back by the
 * server). Skips any movement whose client_id already exists locally, so a
 * retried sync batch or a duplicated Realtime event never double-counts.
 * See .agents/rules/offline-sync-and-ledger.md.
 */
export async function mergeIncomingStockMovements(incoming: StockMovement[]): Promise<void> {
  if (incoming.length === 0) return;

  const incomingClientIds = incoming.map((m) => m.clientId);
  const existingMovements = await db.stockMovements
    .where("clientId")
    .anyOf(incomingClientIds)
    .toArray();
  const existingClientIds = new Set(existingMovements.map((m) => m.clientId));

  const toInsert = incoming.filter((m) => !existingClientIds.has(m.clientId));

  if (toInsert.length > 0) {
    await db.stockMovements.bulkAdd(toInsert);
  }
}
