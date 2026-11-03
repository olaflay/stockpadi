import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { receivePurchase } from "@/features/purchases/receive-purchase";
import type { CurrentUser } from "@/features/auth/use-current-user";

const OWNER: CurrentUser = { id: "owner-1", fullName: "Owner", accountType: "BUSINESS_OWNER" };

describe("receivePurchase local-first sync contract", () => {
  beforeEach(async () => {
    await db.purchases.clear();
    await db.stockMovements.clear();
    await db.products.clear();
    await db.outbox.clear();
  });

  it("writes the purchase, ledger movements, and outbox item together", async () => {
    const purchase = await receivePurchase({
      branchId: "branch-1",
      supplierId: "supplier-1",
      lines: [{ productId: "product-1", quantity: 25, unitCost: 400 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
    });

    expect(await db.purchases.get(purchase.id)).toMatchObject({ id: purchase.id, businessId: "test-business" });
    expect((await db.stockMovements.toArray()).filter((movement) => movement.sourceReferenceId === purchase.id)).toHaveLength(1);
    expect(await db.outbox.get(purchase.id)).toMatchObject({ type: "purchase_receipt", status: "pending", businessId: "test-business" });
  });

  it("accurately respects custom createdAtIso on purchase and ledger movements", async () => {
    const pastDate = "2026-09-20T14:15:00.000Z";
    const purchase = await receivePurchase({
      branchId: "branch-1",
      supplierId: "supplier-1",
      lines: [{ productId: "product-1", quantity: 10, unitCost: 500 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
      createdAtIso: pastDate,
    });

    expect(purchase.createdAtLocal).toBe(pastDate);
    const savedPurchase = await db.purchases.get(purchase.id);
    expect(savedPurchase?.createdAtLocal).toBe(pastDate);

    const movements = (await db.stockMovements.toArray()).filter((m) => m.sourceReferenceId === purchase.id);
    expect(movements[0].createdAtLocal).toBe(pastDate);
  });

  it("automatically recalculates product costPrice using IAS 2 moving weighted average", async () => {
    // Seed existing product with 10 units at ₦100 (total asset value = ₦1,000)
    await db.products.add({
      id: "product-1",
      businessId: "test-business",
      sku: "PROD-1",
      barcode: null,
      name: "Milk",
      categoryId: null,
      brandId: null,
      unitLabel: "piece",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: 100,
      sellPrice: 150,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: 5,
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    // Seed existing stock movement of 10 units
    await db.stockMovements.add({
      id: "init-move-1",
      clientId: "init-move-1",
      businessId: "test-business",
      branchId: "branch-1",
      productId: "product-1",
      quantityDelta: 10,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: OWNER.id,
    });

    // Restock 10 units at ₦200 (incoming value = ₦2,000)
    // New moving average: (1,000 + 2,000) / 20 = ₦150
    await receivePurchase({
      branchId: "branch-1",
      supplierId: "supplier-1",
      lines: [{ productId: "product-1", quantity: 10, unitCost: 200 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
    });

    const updatedProduct = await db.products.get("product-1");
    expect(updatedProduct?.costPrice).toBe(150);
    expect(updatedProduct?.version).toBe(2);
  });
});
