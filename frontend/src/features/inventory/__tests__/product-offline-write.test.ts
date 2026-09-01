import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCurrentStock } from "@/features/inventory/stock";
import { writeNewProductOffline, writeProductEditOffline } from "@/features/inventory/product-offline-write";
import type { Product } from "@/types/product";

const BRANCH_ID = "branch-1";

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    sku: "SKU-1",
    barcode: null,
    name: "Rice",
    categoryId: null,
    brandId: null,
    unitLabel: "bag",
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
    ...overrides,
  };
}

describe("writeNewProductOffline", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();
  });

  it("lands the product and a pending product outbox entry", async () => {
    const product = baseProduct();
    await writeNewProductOffline(product, null);

    const saved = await db.products.get(product.id);
    expect(saved?.name).toBe("Rice");
    expect(saved?.businessId).toBe("test-business");

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("product");
    expect(outbox[0].clientId).toBe(product.id);
    expect(outbox[0].status).toBe("pending");
  });

  it("records opening stock as a movement and queues both outbox entries in one write", async () => {
    const product = baseProduct();
    await writeNewProductOffline(product, {
      branchId: BRANCH_ID,
      quantity: 12,
      createdByUserId: "user-1",
    });

    expect(await getCurrentStock(product.id, BRANCH_ID)).toBe(12);

    const outbox = await db.outbox.toArray();
    const types = outbox.map((o) => o.type).sort();
    expect(types).toEqual(["product", "stock_adjustment"]);
    const adjustment = outbox.find((o) => o.type === "stock_adjustment");
    const payload = adjustment?.payload as { reasonCode?: string; quantityDelta?: number };
    expect(payload.reasonCode).toBe("initial_stock");
    expect(payload.quantityDelta).toBe(12);
  });
});

describe("writeProductEditOffline", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.outbox.clear();
  });

  it("updates an existing local product and queues the merge", async () => {
    const product = baseProduct();
    await db.products.add({ ...product, businessId: "test-business" });

    await writeProductEditOffline(product.id, { sellPrice: 1500 });

    const saved = await db.products.get(product.id);
    expect(saved?.sellPrice).toBe(1500);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("product");
    expect(outbox[0].clientId).toBe(product.id);
    expect((outbox[0].payload as { sellPrice: number }).sellPrice).toBe(1500);
  });

  it("upserts a server-only product (no local row) with a version, then queues the merge", async () => {
    const product = baseProduct();
    // No local row for this product — it lives only on the server.

    await writeProductEditOffline(product.id, { name: "Basmati Rice" });

    const saved = await db.products.get(product.id);
    expect(saved).toBeDefined();
    expect(saved?.name).toBe("Basmati Rice");
    expect(saved?.businessId).toBe("test-business");
    expect(saved?.version).toBe(1);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].clientId).toBe(product.id);
  });
});
