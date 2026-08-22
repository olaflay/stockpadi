import { describe, expect, it } from "vitest";
import { hasCapability, requireAssignedBranch, requireBusinessOwner } from "./capabilities.js";

describe("Owner and Worker capability boundaries", () => {
  const worker = { accountType: "WORKER" as const, permissions: ["POS_SELL", "VIEW_PRODUCTS"] as const, branchIds: ["branch-a"] };
  const owner = { accountType: "BUSINESS_OWNER" as const, permissions: [] as const, branchIds: [] as const };

  it("does not grant Worker administrative capabilities", () => {
    expect(hasCapability(worker, "POS_SELL")).toBe(true);
    expect(hasCapability(worker, "RECEIVE_STOCK")).toBe(false);
    expect(hasCapability(worker, "RECORD_REPAYMENT")).toBe(false);
  });

  it("keeps Owner business capabilities separate from platform Admin", () => {
    expect(hasCapability(owner, "RECEIVE_STOCK")).toBe(true);
    expect(hasCapability(owner, "VIEW_BRANCH_RECONCILIATION")).toBe(true);
  });

  it("enforces assigned branches", () => {
    expect(() => requireAssignedBranch(worker, "branch-a")).not.toThrow();
    expect(() => requireAssignedBranch(worker, "branch-b")).toThrowError(/assigned branches/);
  });

  it("does not let Workers perform Owner operations", () => {
    expect(() => requireBusinessOwner(worker)).toThrowError(/Business Owner/);
    expect(() => requireBusinessOwner(owner)).not.toThrow();
  });
});
