import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { importProducts } from "@/features/inventory/import-products";
import type { ParsedImportRow } from "@/features/inventory/product-import";
import type { Product } from "@/types/product";
import type { CurrentUser } from "@/features/auth/use-current-user";
import { tenantArray } from "@/lib/local-tenant";

vi.mock("@/config/limits", () => ({
  PRODUCT_CAP: 5,
  PRODUCT_CAP_WARN_AT: 4,
  SYNC_REQUIRED_MAX_AGE_MS: 24 * 60 * 60 * 1000,
  SYNC_REQUIRED_QUEUE_THRESHOLD: 100,
}));

const OWNER: CurrentUser = { id: "user-1", fullName: "Owner", role: "owner", accountType: "BUSINESS_OWNER" };

function row(num: number): ParsedImportRow {
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
      lowStockThreshold: 5,
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

  it("makes imported products visible to the tenant-filtered stock list", async () => {
    await importProducts([row(2), row(3)], OWNER, null);

    const visibleProducts = await tenantArray<Product>(db.products.orderBy("name"));

    expect(visibleProducts.map((item) => item.name)).toEqual(["Product 2", "Product 3"]);
    expect(visibleProducts.every((item) => item.businessId === "test-business")).toBe(true);
    expect(await db.outbox.where("type").equals("product").count()).toBe(2);
  });

  it("requires a branch for opening stock and leaves the transaction empty", async () => {
    await expect(importProducts([{ ...row(2), hasInitialStock: true, initialStockQty: 4 }], OWNER, null)).rejects.toThrow("branch");
    expect(await db.products.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("writes products before opening stock and records the dependency in the outbox", async () => {
    await importProducts([{ ...row(2), hasInitialStock: true, initialStockQty: 4 }], OWNER, "branch-1");

    const queued = await db.outbox.orderBy("sequence").toArray();
    expect(queued).toHaveLength(2);
    expect(queued[0].type).toBe("product");
    expect(queued[1].type).toBe("stock_adjustment");
    expect(queued[1].dependsOn).toEqual(["branch-1", queued[0].entityId]);
    expect(queued[1].payload).toMatchObject({ productId: queued[0].entityId, quantityDelta: 4 });
  });
});
