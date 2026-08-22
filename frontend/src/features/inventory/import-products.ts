import { db } from "@/lib/db";
import { withLocalBusinessIds } from "@/lib/local-tenant";
import { serverPost, NetworkUnavailableError } from "@/features/operations/server-client";
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

  if (typeof navigator !== "undefined" && navigator.onLine) {
    try {
      for (const product of products) {
        await serverPost("/api/products", product);
        const movement = movements.find((item) => item.productId === product.id);
        if (movement) await serverPost("/api/inventory/adjust", { id: movement.id, clientId: movement.clientId, branchId: movement.branchId, productId: movement.productId, quantityDelta: movement.quantityDelta, reasonCode: "initial_stock", note: null, createdAtLocal: now });
      }
      return;
    } catch (error) {
      if (!(error instanceof NetworkUnavailableError)) throw error;
    }
  }

  if (movements.length > 0) {
    await db.transaction("rw", db.products, db.stockMovements, async () => {
      await db.products.bulkAdd(await withLocalBusinessIds(products));
      await db.stockMovements.bulkAdd(await withLocalBusinessIds(movements));
    });
  } else {
    await db.products.bulkAdd(await withLocalBusinessIds(products));
  }
}
