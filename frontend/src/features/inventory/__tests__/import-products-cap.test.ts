import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { importProducts } from "@/features/inventory/import-products";
import type { ParsedCsvRow } from "@/features/inventory/csv-import";
import type { Product } from "@/types/product";
import type { CurrentUser } from "@/features/auth/use-current-user";

vi.mock("@/config/limits", () => ({
  PRODUCT_CAP: 5,
  PRODUCT_CAP_WARN_AT: 4,
}));

const OWNER: CurrentUser = { id: "user-1", fullName: "Owner", role: "owner" };

function row(num: number): ParsedCsvRow {
  return {
    rowNum: num,
    hasInitialStock: false,
    initialStockQty: 0,
    data: {
      name: `Product ${num}`,
      sku: `SKU-${num}`,
      barcode: "",
      sellPrice: 1000,
      costPrice: 800,
      unitLabel: "piece",
      altUnitLabel: "",
      altUnitConversionFactor: undefined,
      altUnitSellPrice: undefined,
      expiryTracking: "off",
      expiryDate: "",
      lowStockThreshold: undefined,
    },
  };
}

function product(num: number): Product {
  return {
    id: `product-${num}`,
    sku: `SKU-${num}`,
    barcode: null,
    name: `P${num}`,
    categoryId: null,
    brandId: null,
    unitLabel: "piece",
    altUnitLabel: null,
    altUnitConversionFactor: null,
    altUnitSellPrice: null,
    costPrice: 800,
    sellPrice: 1000,
    expiryTracking: "off",
    expiryDate: null,
    lowStockThreshold: null,
    version: 1,
    updatedAt: new Date().toISOString(),
    businessId: "test-business",
  };
}

describe("importProducts cap enforcement", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();
  });

  it("blocks an import that would push the store past the product cap, adding nothing", async () => {
    await db.products.bulkAdd([product(1), product(2), product(3), product(4)]); // 4 of 5 used

    await expect(
      importProducts([row(5), row(6)], OWNER, null)
    ).rejects.toThrow("product cap");

    expect(await db.products.where("businessId").equals("test-business").count()).toBe(4);
    expect(await db.outbox.count()).toBe(0);
  });

  it("allows an import that stays within the cap", async () => {
    await db.products.bulkAdd([product(1)]); // 1 of 5 used

    await importProducts([row(2), row(3)], OWNER, null);

    expect(await db.products.where("businessId").equals("test-business").count()).toBe(3);
  });
});
