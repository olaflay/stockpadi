import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findProductReferenceConflict } from "@/features/inventory/product-references";
import type { Product } from "@/types/product";

/**
 * The Add/Edit Product screens reject a SKU or barcode already used by
 * another product, mirroring the CSV importer's dedupe rule so the two
 * creation paths agree about what counts as a duplicate. Duplicate reference
 * keys are a real data-integrity problem — two rows shoppers could scan the
 * same barcode against — so this is enforced at submit time, not just a hint.
 */

const BASE: Product = {
  id: "p1",
  sku: "SKU-1",
  barcode: null,
  name: "Test Product",
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
  lowStockThreshold: null,
  version: 1,
  updatedAt: new Date().toISOString(),
};

async function seed(product: Product) {
  await db.products.add(product);
}

describe("findProductReferenceConflict", () => {
  beforeEach(async () => {
    await db.products.clear();
  });

  it("returns null when sku and barcode are both free", async () => {
    await seed({ ...BASE, id: "existing", sku: "OTHER" });
    const conflict = await findProductReferenceConflict({ sku: "SKU-1", barcode: "123" });
    expect(conflict).toBeNull();
  });

  it("flags a duplicate SKU case-insensitively", async () => {
    await seed({ ...BASE, id: "existing", sku: "sku-1" });
    const conflict = await findProductReferenceConflict({ sku: "SKU-1" });
    expect(conflict).toEqual({ field: "sku", value: "sku-1" });
  });

  it("flags a duplicate barcode case-insensitively", async () => {
    await seed({ ...BASE, id: "existing", barcode: "6900001234567" });
    const conflict = await findProductReferenceConflict({ sku: "FRESH", barcode: "6900001234567" });
    expect(conflict).toEqual({ field: "barcode", value: "6900001234567" });
  });

  it("ignores the product being edited via excludeId, so saving an unchanged SKU does not self-collide", async () => {
    await seed({ ...BASE, id: "p1", sku: "SKU-1" });
    const conflict = await findProductReferenceConflict({ sku: "SKU-1" }, "p1");
    expect(conflict).toBeNull();
  });

  it("returns the existing product's value (not the incoming one)", async () => {
    await seed({ ...BASE, id: "existing", sku: "ORIGINAL-SKU" });
    const conflict = await findProductReferenceConflict({ sku: "original-sku" });
    expect(conflict?.value).toBe("ORIGINAL-SKU");
  });
});
