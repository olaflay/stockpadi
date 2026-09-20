import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverGet, branchesMap, quarantinePut } = vi.hoisted(() => ({
  serverGet: vi.fn(),
  branchesMap: new Map<string, { id: string; name: string; isActive: boolean; businessId: string }>(),
  quarantinePut: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/features/operations/server-client", () => ({ serverGet }));
vi.mock("@/lib/db", () => ({
  db: {
    branches: {
      bulkPut: vi.fn((rows: Array<{ id: string; name: string; isActive: boolean; businessId: string }>) => {
        rows.forEach((row) => branchesMap.set(row.id, row));
        return Promise.resolve();
      }),
    },
    syncQuarantine: {
      bulkPut: quarantinePut,
    },
  },
}));
vi.mock("@/lib/local-tenant", () => ({
  getLocalBusinessId: vi.fn(() => Promise.resolve("biz-100")),
  tenantArray: vi.fn(() => Promise.resolve(Array.from(branchesMap.values()))),
}));

import { reconcileLocalBranches } from "./reconcile-branches";

describe("reconcileLocalBranches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    branchesMap.clear();
  });

  it("does not rewrite or delete an unknown local branch", async () => {
    branchesMap.set("offline-branch", { id: "offline-branch", name: "Offline branch", isActive: true, businessId: "biz-100" });
    serverGet.mockResolvedValue({ branches: [{ id: "remote-branch", name: "Main branch", is_active: true, business_id: "biz-100" }] });

    const result = await reconcileLocalBranches();

    expect(result.reconciled).toBe(true);
    expect(result.quarantinedBranchIds).toEqual(["offline-branch"]);
    expect(branchesMap.has("offline-branch")).toBe(true);
    expect(branchesMap.has("remote-branch")).toBe(true);
    expect(result.repairedOutboxCount).toBe(0);
    expect(quarantinePut).toHaveBeenCalled();
  });

  it("surfaces backend pull failures instead of hiding them", async () => {
    serverGet.mockRejectedValue(new Error("backend unavailable"));
    await expect(reconcileLocalBranches()).rejects.toThrow("backend unavailable");
  });
});
