import { beforeEach, describe, expect, it } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { clearLocalBusinessId } from "@/lib/local-tenant";
import { addExpense } from "../add-expense";
import type { CurrentUser } from "@/features/auth/use-current-user";

const OWNER: CurrentUser = {
  id: "user-owner",
  fullName: "Store Owner",
  accountType: "BUSINESS_OWNER",
};

const WORKER_WITHOUT_CAP: CurrentUser = {
  id: "user-worker-1",
  fullName: "Worker 1",
  accountType: "WORKER",
  permissions: ["POS_SELL"],
};

const WORKER_WITH_EXPENSES_CAP: CurrentUser = {
  id: "user-worker-2",
  fullName: "Worker 2",
  accountType: "WORKER",
  permissions: ["POS_SELL", "MANAGE_EXPENSES"],
};

describe("addExpense", () => {
  beforeEach(async () => {
    clearLocalBusinessId();
    await db.expenses.clear();
    await db.outbox.clear();
    await db.businessProfile.put({
      id: BUSINESS_PROFILE_SINGLETON_ID,
      businessId: "biz-123",
      name: "Test Shop",
      businessTypeId: "retail",
      currency: "NGN",
    });
  });

  it("successfully persists expense to IndexedDB and enqueues outbox write for an owner", async () => {
    const expense = await addExpense({
      branchId: "branch-a",
      category: "Transport",
      amount: 2500,
      note: "Delivery run",
      createdByUserId: OWNER.id,
      actor: OWNER,
    });

    expect(expense.id).toBeDefined();
    expect(expense.amount).toBe(2500);
    expect(expense.category).toBe("Transport");
    expect(expense.branchId).toBe("branch-a");

    const savedExpense = await db.expenses.get(expense.id);
    expect(savedExpense).toBeDefined();
    expect(savedExpense?.businessId).toBe("biz-123");
    expect(savedExpense?.amount).toBe(2500);

    const queuedOutbox = await db.outbox.where("clientId").equals(expense.id).first();
    expect(queuedOutbox).toBeDefined();
    expect(queuedOutbox?.type).toBe("expense");
    expect(queuedOutbox?.status).toBe("pending");
    expect(queuedOutbox?.businessId).toBe("biz-123");
  });

  it("permits a worker with MANAGE_EXPENSES permission to record an expense", async () => {
    const expense = await addExpense({
      branchId: "branch-b",
      category: "Supplies",
      amount: 1200,
      note: "Receipt paper",
      createdByUserId: WORKER_WITH_EXPENSES_CAP.id,
      actor: WORKER_WITH_EXPENSES_CAP,
    });

    const saved = await db.expenses.get(expense.id);
    expect(saved).toBeDefined();
    expect(saved?.createdByUserId).toBe("user-worker-2");
    expect(saved?.amount).toBe(1200);
  });

  it("rejects an actor lacking MANAGE_EXPENSES permission and does not write to database or outbox", async () => {
    await expect(
      addExpense({
        branchId: "branch-b",
        category: "Supplies",
        amount: 500,
        note: null,
        createdByUserId: WORKER_WITHOUT_CAP.id,
        actor: WORKER_WITHOUT_CAP,
      })
    ).rejects.toThrow(/manage expenses permission/i);

    expect(await db.expenses.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });
});
