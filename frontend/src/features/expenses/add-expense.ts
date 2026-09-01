import { db } from "@/lib/db";
import type { Expense } from "@/types/expense";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { serverPost } from "@/features/operations/server-client";
import { withLocalBusinessId } from "@/lib/local-tenant";

/**
 * Local-first write, same shape as addExpense's siblings (completeSale,
 * writeStockAdjustment): lands in IndexedDB immediately, queues an outbox
 * entry for the server merge. Expenses aren't a ledger (nothing here is ever
 * summed against a running total the way stock/credit are), so this is a
 * plain create, not an append-only movement. See
 * .agents/rules/offline-sync-and-ledger.md.
 */
export async function addExpense(params: {
  branchId: string | null;
  category: string;
  amount: number;
  note: string | null;
  createdByUserId: string;
  actor: CurrentUser;
}): Promise<Expense> {
  const now = new Date().toISOString();
  const expense: Expense = {
    id: crypto.randomUUID(),
    branchId: params.branchId,
    category: params.category,
    amount: params.amount,
    note: params.note,
    createdAtLocal: now,
    createdByUserId: params.createdByUserId,
  };

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      await serverPost("/api/expenses", expense);
      // The server already has this expense, but every screen renders from
      // IndexedDB, so mirror it locally too (no outbox entry — re-queuing
      // would only re-apply a row the server already committed). See
      // .agents/rules/offline-sync-and-ledger.md: the local store is the
      // display source of truth and must not diverge from what was written.
      await db.transaction("rw", db.expenses, async () => {
        await db.expenses.add(await withLocalBusinessId(expense));
      });
      return expense;
    } catch { /* fall through to the durable local+outbox write below */ }
  }
  await db.transaction("rw", db.expenses, db.outbox, async () => {
    const tenantExpense = await withLocalBusinessId(expense);
    await db.expenses.add(tenantExpense);
    await enqueueOutboxWrite(expense.id, "expense", tenantExpense, now);
  });

  return expense;
}

/**
 * Local-only delete — mirrors the existing product-delete pattern
 * (src/app/(app)/products/[id]/page.tsx), which likewise has no outbox
 * entry today. Deletion sync isn't wired up anywhere in this codebase yet;
 * this stays consistent with that rather than inventing a new mechanism
 * for expenses alone.
 */
export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.delete(id);
}
