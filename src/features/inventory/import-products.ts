import { db } from "@/lib/db";
import { assertPermission } from "@/features/auth/assert-permission";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";
import type { ParsedCsvRow } from "./csv-import";

// Matches every other write-path function (completeSale, writeStockAdjustment,
// etc.) — CurrentUser, not LocalUser. The two were previously mismatched
// here, papered over with a `user as any` cast at the one call site.
export async function importProducts(
  rows: ParsedCsvRow[],
  user: CurrentUser,
  branchId: string | null
): Promise<void> {
  await assertPermission(user, "edit_products");

  const products: Product[] = [];
  const movements: StockMovement[] = [];
  const now = new Date().toISOString();

  for (const row of rows) {
    const data = row.data;
    const productId = crypto.randomUUID();

    const product: Product = {
      id: productId,
      sku: data.sku,
      barcode: data.barcode || null,
      name: data.name,
      categoryId: null, // Categories are skipped in Phase 1 CSV import
      brandId: null,
      unitLabel: data.unitLabel,
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: data.costPrice,
      sellPrice: data.sellPrice,
      expiryTracking: data.expiryTracking,
      expiryDate: null,
      lowStockThreshold: data.lowStockThreshold ?? null,
      version: 1,
      updatedAt: now,
    };
    products.push(product);

    if (row.hasInitialStock && branchId) {
      movements.push({
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        branchId,
        productId,
        quantityDelta: row.initialStockQty,
        source: "initial_stock",
        sourceReferenceId: null,
        reasonCode: null,
        createdAtLocal: now,
        createdAt: now,
        createdByUserId: user.id,
      });
    }
  }

  if (movements.length > 0) {
    await assertPermission(user, "stock_adjustments");
    await db.transaction("rw", db.products, db.stockMovements, async () => {
      await db.products.bulkAdd(products);
      await db.stockMovements.bulkAdd(movements);
    });
  } else {
    await db.products.bulkAdd(products);
  }
}
