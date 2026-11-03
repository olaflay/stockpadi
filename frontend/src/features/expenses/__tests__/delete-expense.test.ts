import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addExpense, deleteExpense } from "../add-expense";
import type { CurrentUser } from "@/features/auth/use-current-user";

const OWNER: CurrentUser = {
  id: "user-1",
  fullName: "Owner",
  accountType: "BUSINESS_OWNER",
};

describe("deleteExpense", () => {
  beforeEach(async () => {
    await db.expenses.clear();
    await db.outbox.clear();
  });

  it("deletes locally created expense that is still pending in the outbox", async () => {
    const expense = await addExpense({
      branchId: "b-1",
      category: "Fuel",
      amount: 5000,
      note: "Generator fuel",
      createdByUserId: OWNER.id,
      actor: OWNER,
    });

    // Verify it exists in db and outbox
    const inDb = await db.expenses.get(expense.id);
    expect(inDb).toBeDefined();

    const inOutbox = await db.outbox.where("clientId").equals(expense.id).first();
    expect(inOutbox).toBeDefined();
    expect(inOutbox?.status).toBe("pending");

    // Deleting should succeed and remove both atomically
    const result = await deleteExpense(expense.id, OWNER);
    expect(result).toEqual({ reversed: false, deleted: true });

    expect(await db.expenses.get(expense.id)).toBeUndefined();
    expect(await db.outbox.where("clientId").equals(expense.id).first()).toBeUndefined();
  });

  it("applies immutable accounting reversal if the expense has already synced", async () => {
    const expenseId = crypto.randomUUID();
    // Insert an expense directly into db as if it arrived from a sync pull (no pending outbox)
    await db.expenses.add({
      id: expenseId,
      branchId: "b-1",
      category: "Rent",
      amount: 50000,
      note: null,
      createdAtLocal: new Date().toISOString(),
      createdByUserId: OWNER.id,
    });

    // Deleting should NOT throw or silently drop the row; it applies an immutable reversal
    const result = await deleteExpense(expenseId, OWNER, "Duplicate entry correction");
    expect(result).toEqual({ reversed: true, deleted: false });

    // Record must still exist in db for audit integrity, but with reversedAt set
    const inDb = await db.expenses.get(expenseId);
    expect(inDb).toBeDefined();
    expect(inDb?.reversedAt).toBeDefined();
    expect(inDb?.reversedByUserId).toBe(OWNER.id);
    expect(inDb?.reversalReason).toBe("Duplicate entry correction");

    // Outbox should contain the expense_reversal mutation
    const outboxItem = await db.outbox.where("type").equals("expense_reversal").first();
    expect(outboxItem).toBeDefined();
    expect(outboxItem?.status).toBe("pending");
    expect((outboxItem?.payload as Record<string, unknown>)?.expenseId).toBe(expenseId);
  });

  it("rejects attempt to reverse an already reversed expense", async () => {
    const expenseId = crypto.randomUUID();
    await db.expenses.add({
      id: expenseId,
      branchId: "b-1",
      category: "Transport",
      amount: 1000,
      note: null,
      createdAtLocal: new Date().toISOString(),
      createdByUserId: OWNER.id,
    });

    await deleteExpense(expenseId, OWNER);

    await expect(deleteExpense(expenseId, OWNER)).rejects.toThrow(
      /already been reversed/i
    );
  });
});
