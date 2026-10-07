import { describe, expect, it } from "vitest";
import { computeHistoricalProfitMetrics } from "@/features/reports/compute-profit";
import type { Sale } from "@/types/sale";
import type { SaleRefund } from "@/types/sale-refund";

function sale(): Sale {
  return {
    id: "sale-1", clientId: "client-1", branchId: "branch-1", customerId: "customer-1",
    items: [{ productId: "product-1", quantity: 2, unitPrice: 150, discount: 0, unitLabel: "piece", conversionFactor: 1, movementClientId: "move-1", unitCost: 100, costBasis: "snapshot" }],
    payments: [{ method: "cash", amount: 300 }], subtotal: 300, discount: 0, total: 300,
    createdAtLocal: "2026-10-01T10:00:00.000Z", createdAt: "2026-10-01T10:00:00.000Z", createdByUserId: "owner", voidedAt: null,
  };
}

function refund(quantity: number, total: number): SaleRefund {
  return {
    id: `refund-${quantity}-${total}`, clientRefundId: `intent-${quantity}-${total}`, branchId: "branch-1", saleId: "sale-1", totalRefunded: total,
    reason: "return", items: [{ productId: "product-1", quantity, unitPrice: 150, total }], payments: [{ method: "cash", amount: total }],
    createdAt: "2026-10-02T10:00:00.000Z", createdAtLocal: "2026-10-02T10:00:00.000Z",
  };
}

describe("financial invariants", () => {
  it("full and partial refunds reduce revenue, COGS, and profit exactly once", () => {
    const original = computeHistoricalProfitMetrics([sale()]);
    const partial = computeHistoricalProfitMetrics([sale()], [refund(1, 150)]);
    const full = computeHistoricalProfitMetrics([sale()], [refund(2, 300)]);
    expect(original).toMatchObject({ revenue: 300, cogs: 200, grossProfit: 100 });
    expect(partial).toMatchObject({ revenue: 150, cogs: 100, grossProfit: 50 });
    expect(full).toMatchObject({ revenue: 0, cogs: 0, grossProfit: 0 });
  });

  it("keeps profit unavailable when any original or refunded cost is unknown", () => {
    const unknown = { ...sale(), items: [{ ...sale().items[0], unitCost: null, costBasis: null }] };
    expect(computeHistoricalProfitMetrics([unknown], [refund(1, 150)]).grossProfit).toBeNull();
  });
});
