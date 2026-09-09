import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import type { Product } from "@/types/product";

/**
 * Returns the human-readable reference field (and value) that would collide
 * with an existing product when creating or editing, or null if the product's
 * SKU/barcode/name are free. Matches the CSV-import dedupe rule (case-insensitive)
 * so the Add/Edit form and the CSV importer agree about what a duplicate is.
 * `excludeId` lets an edit skip the product being edited itself, so saving an
 * unchanged SKU/barcode/name doesn't self-collide.
 *
 * SKU, barcode, and name are treated as stable reference keys for a product, so a
 * duplicate is a real data-integrity problem (two rows buyers could scan the
 * same barcode against, or confusion from identical product names).
 */
export async function findProductReferenceConflict(
  product: { sku: string; barcode?: string | null; name?: string },
  excludeId?: string
): Promise<{ field: "sku" | "barcode" | "name"; value: string } | null> {
  const existing = (await tenantArray(db.products)).filter((p) => p.id !== excludeId);
  const sku = product.sku.trim().toLowerCase();
  const barcode = product.barcode?.trim().toLowerCase() ?? "";
  const name = product.name?.trim().toLowerCase() ?? "";

  if (sku) {
    const hit = existing.find((p) => p.sku.toLowerCase() === sku);
    if (hit) return { field: "sku", value: hit.sku };
  }
  if (barcode) {
    const hit = existing.find((p) => p.barcode && p.barcode.toLowerCase() === barcode);
    if (hit) return { field: "barcode", value: hit.barcode! };
  }
  if (name) {
    const hit = existing.find((p) => p.name.toLowerCase() === name);
    if (hit) return { field: "name", value: hit.name };
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
