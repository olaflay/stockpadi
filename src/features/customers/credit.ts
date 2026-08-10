import { db } from "@/lib/db";

/**
 * Credit balance is always computed from the ledger, never read from a
 * mutable field. Same reasoning as stock. See
 * .agents/rules/offline-sync-and-ledger.md.
 */
export async function getCustomerCreditBalance(customerId: string): Promise<number> {
  const movements = await db.customerCreditMovements.where("customerId").equals(customerId).toArray();

  return movements.reduce((total, m) => total + m.amountDelta, 0);
}

/**
 * Bulk variant for list screens showing every customer's balance at once
 * (Customers page, Dashboard's "total owed" tile) — one indexed read of the
 * whole ledger table, grouped in memory, instead of N separate
 * getCustomerCreditBalance() calls (N separate IndexedDB transactions).
 */
export async function getAllCustomerCreditBalances(): Promise<Map<string, number>> {
  const movements = await db.customerCreditMovements.toArray();
  const balances = new Map<string, number>();
  for (const m of movements) {
    balances.set(m.customerId, (balances.get(m.customerId) ?? 0) + m.amountDelta);
  }
  return balances;
}
