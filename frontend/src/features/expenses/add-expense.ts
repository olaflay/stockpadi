import { db } from "@/lib/db";
import type { Expense } from "@/types/expense";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { withLocalBusinessId } from "@/lib/local-tenant";
import { assertHighRiskWriteAllowed } from "@/features/sync/sync-safety";
import { assertCapability } from "@/features/auth/authorization";

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
  assertCapability(params.actor, "MANAGE_EXPENSES");
  await assertHighRiskWriteAllowed("expense");
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

  await db.transaction("rw", db.expenses, db.outbox, async () => {
    const tenantExpense = await withLocalBusinessId(expense);
    await db.expenses.add(tenantExpense);
    await enqueueOutboxWrite(expense.id, "expense", tenantExpense, now);
  });

  return expense;
}

/**
 * Deletes an expense only when safe to do so.
 * In this offline-first architecture, silent local-only deletes are prohibited because
 * deleting only from local IndexedDB causes silent data loss and permanent divergence
 * from the server and other devices.
 *
 * An expense may only be deleted if it is still pending in the outbox (un-synced local creation),
 * in which case both the local record and its outbox queue entry are removed together atomically.
 *
 * Deletion of an expense that has already synced to the server is blocked because there is no
 * deletion sync pipeline for expenses yet.
 */
export async function deleteExpense(id: string): Promise<void> {
  const pendingOutbox = await db.outbox
    .where("clientId")
    .equals(id)
    .first();

  if (pendingOutbox && (pendingOutbox.status === "pending" || pendingOutbox.status === "blocked")) {
    await db.transaction("rw", db.expenses, db.outbox, async () => {
      await db.expenses.delete(id);
      await db.outbox.delete(pendingOutbox.clientId);
    });
    return;
  }

  throw new Error("This expense has already synced to the cloud. Cloud deletion is not supported.");
}
