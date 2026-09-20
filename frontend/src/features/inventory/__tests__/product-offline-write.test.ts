import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCurrentStock } from "@/features/inventory/stock";
import { writeNewProductOffline, writeProductEditOffline } from "@/features/inventory/product-offline-write";
import type { Product } from "@/types/product";
import type { CurrentUser } from "@/features/auth/use-current-user";

const BRANCH_ID = "branch-1";
const OWNER: CurrentUser = { id: "owner-1", fullName: "Owner", accountType: "BUSINESS_OWNER" };

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
    await writeNewProductOffline(product, null, null, OWNER);

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
    }, null, OWNER);

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

    await writeProductEditOffline(product.id, { sellPrice: 1500 }, null, OWNER);

    const saved = await db.products.get(product.id);
    expect(saved?.sellPrice).toBe(1500);

    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("product");
    expect(outbox[0].clientId).toBe(product.id);
    expect((outbox[0].payload as { sellPrice: number }).sellPrice).toBe(1500);
  });

  it("merges partial edits into a complete snapshot and coalesces a second pending edit", async () => {
    const product = baseProduct({ sku: "ORIGINAL-SKU", categoryId: "category-1", expiryDate: "2027-01-02", lowStockThreshold: 7 });
    await db.products.add({ ...product, businessId: "test-business" });

    await writeProductEditOffline(product.id, { sellPrice: 1500 }, null, OWNER);
    await writeProductEditOffline(product.id, { sku: "UPDATED-SKU" }, null, OWNER);

    const saved = await db.products.get(product.id);
    expect(saved).toMatchObject({
      sku: "UPDATED-SKU",
      sellPrice: 1500,
      costPrice: 800,
      categoryId: "category-1",
      expiryDate: "2027-01-02",
      lowStockThreshold: 7,
    });
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].clientId).toBe(product.id);
    expect(outbox[0].sequence).toBeDefined();
    expect(outbox[0].payload).toMatchObject({ sku: "UPDATED-SKU", sellPrice: 1500, costPrice: 800, categoryId: "category-1" });
  });

  it("records a product-before-stock dependency for opening stock", async () => {
    const product = baseProduct();
    await writeNewProductOffline(product, { branchId: BRANCH_ID, quantity: 4, createdByUserId: "user-1" }, null, OWNER);
    const rows = await db.outbox.toArray();
    const productRow = rows.find((row) => row.type === "product");
    const stockRow = rows.find((row) => row.type === "stock_adjustment");
    expect(productRow?.sequence).toBeLessThan(stockRow?.sequence ?? 0);
    expect(stockRow?.dependsOn).toEqual([BRANCH_ID, product.id]);
  });

  it("chains an edit made while the first product mutation is in flight", async () => {
    const product = baseProduct({ version: 4 });
    await db.products.add({ ...product, businessId: "test-business" });
    await writeProductEditOffline(product.id, { sellPrice: 1200 }, null, OWNER);
    await db.outbox.update(product.id, { status: "syncing" });

    await writeProductEditOffline(product.id, { sellPrice: 1300 }, null, OWNER);

    const rows = await db.outbox.toArray();
    expect(rows).toHaveLength(2);
    const chained = rows.find((row) => row.status === "pending");
    expect(chained?.payload).toMatchObject({ sellPrice: 1300, version: 4 });
    expect(chained?.dependsOn).toContain(product.id);
  });

  it("upserts a server-only product (no local row) with a version, then queues the merge", async () => {
    const product = baseProduct();
    // No local row for this product — it lives only on the server.

    await writeProductEditOffline(product.id, { name: "Basmati Rice" }, null, OWNER);

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
