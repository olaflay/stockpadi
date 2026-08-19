import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { clearLocalBusinessId, setLocalBusinessId, tenantArray } from "@/lib/local-tenant";

describe("local tenant isolation", () => {
  beforeEach(async () => {
    clearLocalBusinessId();
    await db.products.clear();
    await db.businessProfile.put({ id: BUSINESS_PROFILE_SINGLETON_ID, businessId: "business-a", name: "A", businessTypeId: "general_retail", currency: "NGN" });
  });

  afterEach(() => clearLocalBusinessId());

  it("keeps Business A and Business B local records separate in one browser database", async () => {
    await db.products.bulkPut([
      { id: "a-product", businessId: "business-a", sku: "A", barcode: null, name: "A product", categoryId: null, brandId: null, unitLabel: "piece", altUnitLabel: null, altUnitConversionFactor: null, altUnitSellPrice: null, costPrice: 1, sellPrice: 2, expiryTracking: "off", expiryDate: null, lowStockThreshold: null, version: 1, updatedAt: new Date().toISOString() },
      { id: "b-product", businessId: "business-b", sku: "B", barcode: null, name: "B product", categoryId: null, brandId: null, unitLabel: "piece", altUnitLabel: null, altUnitConversionFactor: null, altUnitSellPrice: null, costPrice: 1, sellPrice: 2, expiryTracking: "off", expiryDate: null, lowStockThreshold: null, version: 1, updatedAt: new Date().toISOString() },
    ]);

    await setLocalBusinessId("business-a");
    expect((await tenantArray(db.products)).map((product) => product.id)).toEqual(["a-product"]);

    await setLocalBusinessId("business-b");
    expect((await tenantArray(db.products)).map((product) => product.id)).toEqual(["b-product"]);
    expect(await db.products.count()).toBe(2);
  });
});
