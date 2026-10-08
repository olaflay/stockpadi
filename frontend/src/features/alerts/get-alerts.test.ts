import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAlerts } from "./get-alerts";

function product(id: string, name: string) {
  return {
    id,
    businessId: "test-business",
    sku: id.toUpperCase(),
    barcode: null,
    name,
    categoryId: null,
    brandId: null,
    unitLabel: "piece",
    altUnitLabel: null,
    altUnitConversionFactor: null,
    altUnitSellPrice: null,
    costPrice: 100,
    sellPrice: 150,
    expiryTracking: "off" as const,
    expiryDate: null,
    lowStockThreshold: null,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

describe("worker stock alerts", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.inventoryStock.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();

    await db.products.bulkPut([
      product("product-branch-a", "Branch A item"),
      product("product-branch-b", "Branch B item"),
    ]);

    await db.inventoryStock.bulkPut([
      {
        id: "test-business:product-branch-a:branch-a",
        businessId: "test-business",
        productId: "product-branch-a",
        branchId: "branch-a",
        quantity: 2,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "test-business:product-branch-a:branch-b",
        businessId: "test-business",
        productId: "product-branch-a",
        branchId: "branch-b",
        quantity: 20,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "test-business:product-branch-b:branch-b",
        businessId: "test-business",
        productId: "product-branch-b",
        branchId: "branch-b",
        quantity: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  it("shows only low-stock warnings for a worker's assigned branches", async () => {
    const alerts = await getAlerts(4, {
      branchScope: ["branch-a"],
      lowStockOnly: true,
    });

    expect(alerts).toEqual([
      expect.objectContaining({
        id: "low-stock-product-branch-a",
        type: "low_stock",
        title: "Low stock",
      }),
    ]);
  });
});
