import { db } from "@/lib/db";
import { withLocalBusinessIds } from "@/lib/local-tenant";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { countActiveProducts, productCapStatusFor } from "@/features/inventory/product-cap";
import { PRODUCT_CAP } from "@/config/limits";
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

  const projectedCount = (await countActiveProducts()) + rows.length;
  if (productCapStatusFor(projectedCount) === "blocked") {
    throw new Error(`This import would exceed the ${PRODUCT_CAP}-product cap for this store.`);
  }

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
      const movementId = crypto.randomUUID();
      movements.push({
        id: movementId,
        clientId: movementId,
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

  const tenantProducts = await withLocalBusinessIds(products);
  const tenantMovements = await withLocalBusinessIds(movements);

  // Import is always committed through the same offline-first path as every
  // other product write (data + outbox in one transaction), never a
  // server-only fast path. The earlier version wrote straight to IndexedDB
  // and skipped the outbox on the offline branch, so an offline import
  // looked like success but was invisible to the server and every other
  // device. Enqueuing each product plus its opening-stock movement (with a
  // stable clientId so a retry never double-counts) makes the import durable
  // and convergent. See .agents/rules/offline-sync-and-ledger.md.
  await db.transaction("rw", db.products, db.stockMovements, db.outbox, async () => {
    await db.products.bulkAdd(tenantProducts);
    if (tenantMovements.length > 0) await db.stockMovements.bulkAdd(tenantMovements);
    for (const product of tenantProducts) {
      await enqueueOutboxWrite(product.id, "product", product, now);
    }
    for (const movement of tenantMovements) {
      await enqueueOutboxWrite(movement.id, "stock_adjustment", {
        id: movement.id,
        clientId: movement.clientId,
        branchId: movement.branchId,
        productId: movement.productId,
        quantityDelta: movement.quantityDelta,
        reasonCode: "initial_stock" as const,
        note: null,
        createdAtLocal: now,
      }, now);
    }
  });
}
