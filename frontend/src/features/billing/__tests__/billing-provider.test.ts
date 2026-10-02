import { describe, expect, it } from "vitest";
import { LocalBillingProvider, TIER_LIMITS } from "@/features/billing/billing-provider";

describe("Billing Provider Architecture", () => {
  it("defaults to FREE tier with 75 products, 1 branch, 1 device and zero cloud egress", async () => {
    const provider = new LocalBillingProvider();
    const tier = await provider.getCurrentTier();
    expect(tier).toBe("FREE");

    const limits = await provider.getLimits();
    expect(limits.maxProducts).toBe(75);
    expect(limits.maxBranches).toBe(1);
    expect(limits.maxDevices).toBe(1);
    expect(limits.cloudSyncEnabled).toBe(false);
  });

  it("permits adding products up to 75 and enforces boundary beyond 75", async () => {
    const provider = new LocalBillingProvider("FREE");

    const underLimit = await provider.checkCanAddProduct(50);
    expect(underLimit.allowed).toBe(true);

    const atLimit = await provider.checkCanAddProduct(75);
    expect(atLimit.allowed).toBe(false);
    expect(atLimit.reason).toContain("75 products on FREE plan");
  });

  it("permits 1 branch on FREE and restricts adding second branch without upgrade", async () => {
    const provider = new LocalBillingProvider("FREE");

    const zeroBranches = await provider.checkCanAddBranch(0);
    expect(zeroBranches.allowed).toBe(true);

    const oneBranch = await provider.checkCanAddBranch(1);
    expect(oneBranch.allowed).toBe(false);
    expect(oneBranch.reason).toContain("Branch limit reached");
  });

  it("supports STARTER and GROWTH tiers with expanded limits", async () => {
    const starterProvider = new LocalBillingProvider("STARTER");
    const starterLimits = await starterProvider.getLimits();
    expect(starterLimits.maxProducts).toBe(1000);
    expect(starterLimits.cloudSyncEnabled).toBe(true);

    const growthProvider = new LocalBillingProvider("GROWTH");
    const growthLimits = await growthProvider.getLimits();
    expect(growthLimits.maxBranches).toBe(6);
    expect(growthLimits.maxProducts).toBe(10000);
  });
});
