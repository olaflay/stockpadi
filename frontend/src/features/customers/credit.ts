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

/**
 * Debt aging: for each customer, find the oldest negative credit movement
 * (debt) and compute how many days ago it was created. Used for the aging
 * chip on the customer list.
 *
 * Returns a map of customerId → days since oldest debt (0 if no debt).
 */
export async function getCustomerDebtAges(): Promise<Map<string, number>> {
  const movements = await db.customerCreditMovements.toArray();
  const now = Date.now();
  const oldestDebt = new Map<string, number>(); // customerId → oldest timestamp

  for (const m of movements) {
    if (m.amountDelta <= 0) continue; // Only positive movements = credit purchases / debt incurred
    const ts = new Date(m.createdAtLocal).getTime();
    const current = oldestDebt.get(m.customerId);
    if (current === undefined || ts < current) {
      oldestDebt.set(m.customerId, ts);
    }
  }

  const ages = new Map<string, number>();
  for (const [customerId, ts] of oldestDebt) {
    ages.set(customerId, Math.floor((now - ts) / (1000 * 60 * 60 * 24)));
  }
  return ages;
}

/** Aging bucket labels and colors for the debt aging chip. */
export function getAgingBucket(days: number): { label: string; colorClass: string } {
  if (days <= 7) return { label: "Current", colorClass: "bg-success/15 text-success" };
  if (days <= 30) return { label: `${days}d`, colorClass: "bg-warning/15 text-warning" };
  if (days <= 90) return { label: `${days}d`, colorClass: "bg-orange-500/15 text-orange-500" };
  return { label: `${days}d+`, colorClass: "bg-danger/15 text-danger" };
}
