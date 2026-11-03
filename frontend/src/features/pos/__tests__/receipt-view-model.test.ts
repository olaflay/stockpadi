import { describe, expect, it } from "vitest";
import { createReceiptViewModel } from "@/features/pos/receipt-view-model";
import { receiptExportFileName } from "@/features/pos/receipt-share";
import type { Sale } from "@/types/sale";

const sale: Sale = {
  id: "12345678-1234-1234-1234-123456789012",
  clientId: "12345678-1234-1234-1234-123456789012",
  branchId: "branch-1",
  customerId: null,
  subtotal: 2400,
  discount: 200,
  total: 2200,
  createdAt: "2026-11-02T08:00:00.000Z",
  createdAtLocal: "2026-11-02T08:00:00.000Z",
  createdByUserId: "user-1",
  voidedAt: null,
  payments: [{ method: "cash", amount: 2200 }],
  items: [{ productId: "product-1", productNameSnapshot: "Sale-time label", quantity: 2, unitPrice: 1200, discount: 200, unitLabel: "piece", conversionFactor: 1, movementClientId: "movement-1" }],
};

describe("createReceiptViewModel", () => {
  it("uses the recorded sale-time label and money figures", () => {
    const receipt = createReceiptViewModel({ sale, businessName: "Configured business" });
    expect(receipt.items[0]).toMatchObject({ name: "Sale-time label", total: 2200 });
    expect(receipt.total).toBe(2200);
    expect(receipt.payments).toEqual(sale.payments);
  });

  it("does not invent a product name for legacy sale lines", () => {
    const legacy = { ...sale, items: [{ ...sale.items[0], productNameSnapshot: null }] };
    const receipt = createReceiptViewModel({ sale: legacy, businessName: "Configured business", legacyProductNames: new Map([["product-1", "Current catalogue label"]]) });
    expect(receipt.items[0].name).toBe("Current catalogue label");
    expect(receipt.usesCurrentCatalogLabels).toBe(true);
  });
});

describe("receipt export file names", () => {
  it("uses the fixed customer-facing sales receipt names", () => {
    expect(receiptExportFileName("pdf")).toBe("sales_receipt.pdf");
    expect(receiptExportFileName("jpg")).toBe("sales_receipt.jpg");
  });
});
