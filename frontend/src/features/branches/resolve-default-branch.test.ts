import { describe, expect, it } from "vitest";
import { resolveDefaultBranch } from "./resolve-default-branch";

const BRANCHES = [
  { id: "branch-a", isPrimary: true },
  { id: "branch-b", isPrimary: false },
] as const;

function user(overrides: { accountType?: string; branchIds?: string[] }) {
  return {
    accountType: overrides.accountType ?? "BUSINESS_OWNER",
    branchIds: overrides.branchIds,
  } as never;
}

describe("resolveDefaultBranch", () => {
  it("gives an owner the active primary branch", () => {
    expect(resolveDefaultBranch(BRANCHES, user({ accountType: "BUSINESS_OWNER" }))).toBe("branch-a");
  });

  it("gives an admin the active primary branch", () => {
    expect(resolveDefaultBranch(BRANCHES, user({ accountType: "ADMIN" }))).toBe("branch-a");
  });

  it("gives a worker their assigned branch even when it is not the first", () => {
    expect(resolveDefaultBranch(BRANCHES, user({ accountType: "WORKER", branchIds: ["branch-b"] }))).toBe("branch-b");
  });

  it("returns undefined for a worker whose assignment is not on the device", () => {
    expect(resolveDefaultBranch(BRANCHES, user({ accountType: "WORKER", branchIds: ["branch-elsewhere"] }))).toBeUndefined();
  });

  it("returns undefined for a worker with no assignment", () => {
    expect(resolveDefaultBranch(BRANCHES, user({ accountType: "WORKER", branchIds: [] }))).toBeUndefined();
  });

  it("returns undefined when there are no branches at all", () => {
    expect(resolveDefaultBranch([], user({ accountType: "BUSINESS_OWNER" }))).toBeUndefined();
  });

  it("does not guess when an owner has no primary branch", () => {
    expect(resolveDefaultBranch([{ id: "branch-a" }], user({ accountType: "BUSINESS_OWNER" }))).toBeUndefined();
  });
});
