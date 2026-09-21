import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getStockByProduct } from "@/features/inventory/product-insights";

describe("branch-scoped stock projections", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.inventoryStock.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();
    await db.products.put({
      id: "product-coke",
      businessId: "test-business",
      sku: "COKE",
      barcode: null,
      name: "Coke 50cl",
      categoryId: null,
      brandId: null,
      unitLabel: "piece",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: 300,
      sellPrice: 500,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: null,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
    await db.inventoryStock.bulkPut([
      { id: "test-business:product-coke:branch-ikeja", businessId: "test-business", productId: "product-coke", branchId: "branch-ikeja", quantity: 20, updatedAt: new Date().toISOString() },
      { id: "test-business:product-coke:branch-lekki", businessId: "test-business", productId: "product-coke", branchId: "branch-lekki", quantity: 0, updatedAt: new Date().toISOString() },
    ]);
  });

  it("keeps catalogue identity business-wide while scoping displayed stock", async () => {
    expect(await getStockByProduct(["branch-ikeja"])).toEqual(new Map([["product-coke", 20]]));
    expect(await getStockByProduct(["branch-lekki"])).toEqual(new Map([["product-coke", 0]]));
    expect(await getStockByProduct(null)).toEqual(new Map([["product-coke", 20]]));
  });

  it("falls back to the exact branch ledger only when that branch projection is missing", async () => {
    await db.inventoryStock.delete("test-business:product-coke:branch-ikeja");
    await db.stockMovements.put({
      id: "opening-coke-ikeja",
      clientId: "opening-coke-ikeja",
      businessId: "test-business",
      branchId: "branch-ikeja",
      productId: "product-coke",
      quantityDelta: 20,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "owner",
    });

    expect(await getStockByProduct("branch-ikeja")).toEqual(new Map([["product-coke", 20]]));
    expect(await getStockByProduct("branch-lekki")).toEqual(new Map([["product-coke", 0]]));
  });
});
