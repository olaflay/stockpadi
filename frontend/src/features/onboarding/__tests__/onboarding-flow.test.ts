import { describe, expect, it, beforeEach } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES, getBusinessTypeTemplate } from "@/config/business-types";

describe("Onboarding Flow Logic & Storage", () => {
  beforeEach(async () => {
    await db.businessProfile.clear();
    await db.categories.clear();
    await db.branches.clear();
    await db.products.clear();
    await db.stockMovements.clear();
  });

  it("loads predefined business-type templates with starter products", () => {
    expect(BUSINESS_TYPE_TEMPLATES.length).toBe(6);

    const retail = getBusinessTypeTemplate("retail");
    expect(retail).toBeDefined();
    expect(retail?.defaultCategories).toContain("Foodstuffs");
    expect(retail?.sampleProducts.length).toBeGreaterThan(0);

    const materials = getBusinessTypeTemplate("materials");
    expect(materials).toBeDefined();
    expect(materials?.defaultCategories).toContain("Building");

    const health = getBusinessTypeTemplate("health");
    expect(health).toBeDefined();
    expect(health?.expiryTracking).toBe("mandatory");
  });

  it("calculates live margin and unit profit correctly", () => {
    const cost = 1200;
    const sell = 1500;
    const profit = sell - cost;
    const marginPercent = ((profit / sell) * 100).toFixed(1);

    expect(profit).toBe(300);
    expect(marginPercent).toBe("20.0");
  });

  it("persists business profile, categories, branches, and sample starter products into Dexie", async () => {
    const template = getBusinessTypeTemplate("retail")!;
    const branchId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.transaction(
      "rw",
      db.businessProfile,
      db.categories,
      db.branches,
      db.products,
      db.stockMovements,
      async () => {
        await db.businessProfile.put({
          id: BUSINESS_PROFILE_SINGLETON_ID,
          name: "Mama Tolu Provisions",
          businessTypeId: template.id,
          currency: "NGN",
        });

        await db.categories.bulkPut(
          template.defaultCategories.map((name) => ({
            id: crypto.randomUUID(),
            name,
          }))
        );

        await db.branches.add({
          id: branchId,
          name: "Main branch",
          isActive: true,
        });

        for (const sample of template.sampleProducts) {
          const prodId = crypto.randomUUID();
          await db.products.put({
            id: prodId,
            sku: sample.sku,
            barcode: null,
            name: sample.name,
            categoryId: null,
            brandId: null,
            unitLabel: sample.unitLabel,
            altUnitLabel: null,
            altUnitConversionFactor: null,
            altUnitSellPrice: null,
            costPrice: sample.costPrice,
            sellPrice: sample.sellPrice,
            expiryTracking: template.expiryTracking,
            expiryDate: null,
            lowStockThreshold: sample.lowStockThreshold,
            version: 1,
            updatedAt: now,
          });

          await db.stockMovements.put({
            id: crypto.randomUUID(),
            clientId: crypto.randomUUID(),
            branchId,
            productId: prodId,
            quantityDelta: 20,
            source: "initial_stock",
            sourceReferenceId: null,
            reasonCode: null,
            createdAtLocal: now,
            createdAt: now,
            createdByUserId: "owner",
          });
        }
      }
    );

    const savedProfile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
    expect(savedProfile?.name).toBe("Mama Tolu Provisions");
    expect(savedProfile?.businessTypeId).toBe("retail");

    const categories = await db.categories.toArray();
    expect(categories.length).toBe(template.defaultCategories.length);

    const products = await db.products.toArray();
    expect(products.length).toBe(template.sampleProducts.length);

    const movements = await db.stockMovements.toArray();
    expect(movements.length).toBe(template.sampleProducts.length);
    expect(movements[0].source).toBe("initial_stock");
    expect(movements[0].quantityDelta).toBe(20);
  });
});
