import { describe, expect, it } from "vitest";
import { resolveAccountContext } from "./account-context.js";

const user = { id: "user-1" } as never;

function dbReturning(data: unknown, error: { message: string } | null = null) {
  return { rpc: () => ({ maybeSingle: async () => ({ data, error }) }) } as never;
}

describe("canonical account context", () => {
  it("resolves an Admin without a business", async () => {
    await expect(resolveAccountContext(dbReturning({ user_id: "user-1", account_type: "ADMIN", business_id: null, business_status: null, membership_status: null, branch_ids: [] }), user)).resolves.toMatchObject({ accountType: "ADMIN", businessId: null, branchIds: [] });
  });

  it("resolves an active Business Owner tenant", async () => {
    await expect(resolveAccountContext(dbReturning({ user_id: "user-1", account_type: "BUSINESS_OWNER", business_id: "business-a", business_status: "verified", membership_status: "active", branch_ids: [] }), user)).resolves.toMatchObject({ accountType: "BUSINESS_OWNER", businessId: "business-a", businessStatus: "verified", membershipStatus: "active" });
  });

  it("resolves Worker branch assignments", async () => {
    await expect(resolveAccountContext(dbReturning({ user_id: "user-1", account_type: "WORKER", business_id: "business-a", business_status: "verified", membership_status: "active", branch_ids: ["branch-a", "branch-b"] }), user)).resolves.toMatchObject({ accountType: "WORKER", businessId: "business-a", branchIds: ["branch-a", "branch-b"] });
  });

  it("preserves tenant and branch boundaries from the database result", async () => {
    const context = await resolveAccountContext(dbReturning({
      user_id: "user-1",
      account_type: "WORKER",
      business_id: "business-a",
      business_status: "verified",
      membership_status: "active",
      branch_ids: ["branch-a"],
    }), user);

    expect(context.businessId).toBe("business-a");
    expect(context.branchIds).toEqual(["branch-a"]);
    expect(context.branchIds).not.toContain("branch-b");
  });

  it("keeps Admin independent from tenant membership", async () => {
    const context = await resolveAccountContext(dbReturning({
      user_id: "user-1",
      account_type: "ADMIN",
      business_id: null,
      business_status: null,
      membership_status: null,
      branch_ids: [],
    }), user);

    expect(context.accountType).toBe("ADMIN");
    expect(context.businessId).toBeNull();
  });

  it.each([
    ["suspended business", { account_type: "BUSINESS_OWNER", business_id: "business-a", business_status: "suspended", membership_status: "active", branch_ids: [] }],
    ["disabled Worker", { account_type: "WORKER", business_id: "business-a", business_status: "verified", membership_status: "disabled", branch_ids: ["branch-a"] }],
    ["inactive membership", { account_type: "BUSINESS_OWNER", business_id: "business-a", business_status: "verified", membership_status: "inactive", branch_ids: [] }],
  ])("rejects %s from an active context", async (_label, values) => {
    await expect(resolveAccountContext(dbReturning({ user_id: "user-1", ...values }), user)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("rejects a suspended or disabled context returned by the database", async () => {
    await expect(resolveAccountContext(dbReturning(null), user)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("does not accept a context belonging to another authenticated user", async () => {
    await expect(resolveAccountContext(dbReturning({ user_id: "another-user", account_type: "WORKER", business_id: "business-a", business_status: "verified", membership_status: "active", branch_ids: [] }), user)).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("surfaces database resolver failures as server errors", async () => {
    await expect(resolveAccountContext(dbReturning(null, { message: "rpc failed" }), user)).rejects.toMatchObject({ status: 500, code: "ACCOUNT_CONTEXT_FAILED" });
  });
});
