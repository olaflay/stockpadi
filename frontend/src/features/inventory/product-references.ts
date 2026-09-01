import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import type { Product } from "@/types/product";

/**
 * Returns the human-readable reference field (and value) that would collide
 * with an existing product when creating or editing, or null if the product's
 * SKU/barcode are free. Matches the CSV-import dedupe rule (case-insensitive)
 * so the Add/Edit form and the CSV importer agree about what a duplicate is.
 * `excludeId` lets an edit skip the product being edited itself, so saving an
 * unchanged SKU/barcode doesn't self-collide.
 *
 * SKU and barcode are treated as stable reference keys for a product, so a
 * duplicate is a real data-integrity problem (two rows buyers could scan the
 * same barcode against), not just a nicety.
 */
export async function findProductReferenceConflict(
  product: { sku: string; barcode?: string | null },
  excludeId?: string
): Promise<{ field: "sku" | "barcode"; value: string } | null> {
  const existing = (await tenantArray(db.products)).filter((p) => p.id !== excludeId);
  const sku = product.sku.trim().toLowerCase();
  const barcode = product.barcode?.trim().toLowerCase() ?? "";

  if (sku) {
    const hit = existing.find((p) => p.sku.toLowerCase() === sku);
    if (hit) return { field: "sku", value: hit.sku };
  }
  if (barcode) {
    const hit = existing.find((p) => p.barcode && p.barcode.toLowerCase() === barcode);
    if (hit) return { field: "barcode", value: hit.barcode! };
  }
  return null;
}

/** Convenience predicate wrapper for call sites that just want a boolean. */
export async function hasProductReferenceConflict(
  product: Product,
  excludeId?: string
): Promise<boolean> {
  return (await findProductReferenceConflict(product, excludeId)) !== null;
}
