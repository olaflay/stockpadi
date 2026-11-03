import { db, withDatabaseClosedRecovery } from "@/lib/db";
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
  createdAtIso?: string;
}): Promise<Expense> {
  assertCapability(params.actor, "MANAGE_EXPENSES");
  await assertHighRiskWriteAllowed("expense");
  const now = new Date().toISOString();
  const createdAt = params.createdAtIso || now;
  const expense: Expense = {
    id: crypto.randomUUID(),
    branchId: params.branchId,
    category: params.category,
    amount: params.amount,
    note: params.note,
    createdAtLocal: createdAt,
    createdByUserId: params.createdByUserId,
  };

  await withDatabaseClosedRecovery(() => db.transaction("rw", db.expenses, db.outbox, async () => {
    const tenantExpense = await withLocalBusinessId(expense);
    await db.expenses.add(tenantExpense);
    await enqueueOutboxWrite(expense.id, "expense", tenantExpense, now);
  }));

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
export async function deleteExpense(
  id: string,
  actor?: CurrentUser,
  reversalReason: string = "User requested expense reversal"
): Promise<{ reversed: boolean; deleted: boolean }> {
  const pendingOutbox = await db.outbox
    .where("clientId")
    .equals(id)
    .first();

  if (pendingOutbox && (pendingOutbox.status === "pending" || pendingOutbox.status === "blocked")) {
    await withDatabaseClosedRecovery(() => db.transaction("rw", db.expenses, db.outbox, async () => {
      await db.expenses.delete(id);
      await db.outbox.delete(pendingOutbox.clientId);
    }));
    return { reversed: false, deleted: true };
  }

  // Record has already synced (or arrived from cloud). Execute immutable reversal.
  const expense = await db.expenses.get(id);
  if (!expense) {
    throw new Error("Expense not found.");
  }
  if (expense.reversedAt) {
    throw new Error("This expense has already been reversed.");
  }

  if (actor) {
    assertCapability(actor, "MANAGE_EXPENSES");
  }
  await assertHighRiskWriteAllowed("expense_reversal");

  const now = new Date().toISOString();
  const reversalPayload = {
    expenseId: id,
    reversedAt: now,
    reversedByUserId: actor?.id ?? expense.createdByUserId,
    reversalReason: reversalReason.trim() || "User requested expense reversal",
  };

  const reversalMutationId = crypto.randomUUID();

  await withDatabaseClosedRecovery(() => db.transaction("rw", db.expenses, db.outbox, async () => {
    await db.expenses.update(id, {
      reversedAt: now,
      reversedByUserId: reversalPayload.reversedByUserId,
      reversalReason: reversalPayload.reversalReason,
    });
    const tenantPayload = await withLocalBusinessId({
      id: reversalMutationId,
      ...reversalPayload,
    });
    await enqueueOutboxWrite(reversalMutationId, "expense_reversal", tenantPayload, now);
  }));

  return { reversed: true, deleted: false };
}
