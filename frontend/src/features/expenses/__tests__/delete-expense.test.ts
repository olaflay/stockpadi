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

    // Deleting should succeed and remove both
    await deleteExpense(expense.id);

    expect(await db.expenses.get(expense.id)).toBeUndefined();
    expect(await db.outbox.where("clientId").equals(expense.id).first()).toBeUndefined();
  });

  it("blocks silent local-only delete if the expense has already synced", async () => {
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

    await expect(deleteExpense(expenseId)).rejects.toThrow(
      /already synced to the cloud/i
    );

    // Record should still be in db
    expect(await db.expenses.get(expenseId)).toBeDefined();
  });
});
