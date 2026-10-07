import { describe, expect, it } from "vitest";
import { computeCogs, computeGrossProfit, computeHistoricalProfitMetrics } from "@/features/reports/compute-profit";
import type { Sale } from "@/types/sale";

function sale(unitCost: number | null): Sale {
  return {
    id: "s1", clientId: "c1", branchId: "br1", customerId: null,
    items: [{ productId: "p1", quantity: 10, unitPrice: 150, discount: 0, unitLabel: "piece", conversionFactor: 1, movementClientId: "m1", unitCost, costBasis: unitCost === null ? null : "snapshot" }],
    payments: [{ method: "cash", amount: 1500 }], subtotal: 1500, discount: 0, total: 1500,
    createdAtLocal: "2026-03-01T10:00:00.000Z", createdAt: "2026-03-01T10:00:00.000Z", createdByUserId: "user-1", voidedAt: null,
  };
}

describe("historical cost correctness", () => {
  it("keeps profit and COGS stable when the current product cost changes", () => {
    const historicalSale = sale(100);
    const currentProductAtSale = [{ id: "p1", costPrice: 100 }] as never[];
    const currentProductAfterEdit = [{ id: "p1", costPrice: 150 }] as never[];
    expect(computeGrossProfit([historicalSale], currentProductAtSale)).toBe(500);
    expect(computeGrossProfit([historicalSale], currentProductAfterEdit)).toBe(500);
    expect(computeCogs([historicalSale], currentProductAfterEdit)).toBe(1000);
  });

  it("does not fabricate historical profit when the immutable snapshot is missing", () => {
    const metrics = computeHistoricalProfitMetrics([sale(null)]);
    expect(metrics.costStatus).toBe("unavailable");
    expect(metrics.cogs).toBeNull();
    expect(metrics.grossProfit).toBeNull();
    expect(computeGrossProfit([sale(null)], [{ id: "p1", costPrice: 150 }] as never[])).toBeNull();
  });
});
