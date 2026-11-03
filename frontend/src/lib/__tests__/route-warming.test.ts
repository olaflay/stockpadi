import { describe, expect, it } from "vitest";
import { resolveRouteWarmingStrategy } from "@/lib/route-warming";

describe("resolveRouteWarmingStrategy", () => {
  it.each(["slow-2g", "2g", "3g"])("backs off background warming on %s", (effectiveType) => {
    const constrained = resolveRouteWarmingStrategy({ effectiveType });
    const fast = resolveRouteWarmingStrategy({ effectiveType: "4g" });

    expect(constrained.initialDelayMs).toBeGreaterThan(fast.initialDelayMs);
    expect(constrained.betweenRoutesMs).toBeGreaterThan(fast.betweenRoutesMs);
  });

  it("honours data saver even when the reported connection is fast", () => {
    expect(resolveRouteWarmingStrategy({ effectiveType: "4g", saveData: true }).betweenRoutesMs)
      .toBe(750);
  });
});
