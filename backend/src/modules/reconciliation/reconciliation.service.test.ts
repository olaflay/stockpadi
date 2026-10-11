import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supabaseAdmin: vi.fn(),
  resolveAccountContext: vi.fn(),
  queueSyncHints: vi.fn(),
}));

vi.mock("../../shared/supabase/client.js", () => ({
  supabaseAdmin: mocks.supabaseAdmin,
}));

vi.mock("../accounts/account-context.js", () => ({
  resolveAccountContext: mocks.resolveAccountContext,
}));

vi.mock("../sync/sync-hints.js", () => ({
  queueSyncHints: mocks.queueSyncHints,
}));

import { submitReconciliation } from "./reconciliation.service.js";

const actor = { id: "owner-1" } as never;
const context = {
  accountType: "BUSINESS_OWNER",
  businessId: "business-a",
  branchIds: [],
  permissions: ["SUBMIT_RECONCILIATION"],
  businessStatus: "verified",
  membershipStatus: "active",
  userId: "owner-1",
} as never;

describe("reconciliation service", () => {
  it("resolves account context with the server client, not the user RLS client", async () => {
    const adminDb = { name: "admin-db" };
    const branchQuery = {
      select: () => branchQuery,
      eq: () => branchQuery,
      maybeSingle: async () => ({ data: { id: "branch-a" }, error: null }),
    };
    const insertQuery = {
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: "close-day-1" }, error: null }),
        }),
      }),
    };
    const userDb = {
      from: vi.fn((table: string) => table === "branches" ? branchQuery : insertQuery),
    };

    mocks.supabaseAdmin.mockReturnValue(adminDb);
    mocks.resolveAccountContext.mockImplementation(async (db: unknown) => {
      expect(db).toBe(adminDb);
      return context;
    });
    mocks.queueSyncHints.mockResolvedValue(undefined);

    await expect(submitReconciliation(userDb as never, actor, {
      branchId: "branch-a",
      actualCash: 100,
      expectedCash: 100,
      expectedTransfer: 0,
      expectedPos: 0,
      expectedCredit: 0,
      discrepancy: 0,
      note: null,
    })).resolves.toEqual({ id: "close-day-1" });

    expect(mocks.supabaseAdmin).toHaveBeenCalled();
    expect(mocks.queueSyncHints).toHaveBeenCalledWith("business-a", ["branch-a"]);
  });
});
