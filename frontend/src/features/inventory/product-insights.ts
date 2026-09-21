import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { getPendingStockMovementIds } from "@/features/inventory/stock";

/**
 * Shared read-only helpers for "which products need attention" — used by
 * the Products page filter chips. Reuses the same threshold constant and
 * stock/sales aggregation shape already established in
 * use-dashboard-metrics.ts and reports/page.tsx, so all three screens agree
 * on what "low stock" and "best selling" mean.
 */

export const LOW_STOCK_THRESHOLD = 5;
export const EXPIRY_ALERT_WINDOW_DAYS = 7;

/**
 * Stock per product, computed from the append-only ledger. branchId null =
 * consolidated across all branches (business-level view). Mirrors the ledger
 * summation in use-dashboard-metrics.ts and pos/page.tsx so every screen
 * reads quantity the same way — see .agents/rules/offline-sync-and-ledger.md.
 */
export type StockBranchScope = string | readonly string[] | null;

export async function getStockByProduct(
  branchScope: StockBranchScope = null
): Promise<Map<string, number>> {
  const branchIds = Array.isArray(branchScope) ? new Set(branchScope) : null;
  const branchId = typeof branchScope === "string" ? branchScope : null;
  const movements =
    branchIds
      ? (await tenantArray(db.stockMovements)).filter((movement) => branchIds.has(movement.branchId))
      : branchId !== null
        ? await tenantArray(db.stockMovements.where("branchId").equals(branchId))
        : await tenantArray(db.stockMovements);
  const stockByProduct = new Map<string, number>();
  if (db.tables.some((table) => table.name === "inventoryStock")) {
    const projections = branchIds
      ? (await tenantArray(db.inventoryStock)).filter((projection) => branchIds.has(projection.branchId))
      : branchId === null
        ? await tenantArray(db.inventoryStock)
        : await tenantArray(db.inventoryStock.where("branchId").equals(branchId));
    const products = await tenantArray(db.products);
    const productIds = new Set(products.filter((product) => product.businessId).map((product) => product.id));
    const projectionKeys = new Set<string>();
    for (const projection of projections) {
      if (!productIds.has(projection.productId)) continue;
      projectionKeys.add(`${projection.productId}:${projection.branchId}`);
      stockByProduct.set(projection.productId, (stockByProduct.get(projection.productId) ?? 0) + projection.quantity);
    }
    const pendingMovementIds = await getPendingStockMovementIds();
    for (const movement of movements) {
      // A projection row is authoritative even when its quantity is zero.
      // If the exact product/branch row is absent, fall back to the local
      // ledger so a partial/stale pull cannot turn known stock into 0.
      const hasAuthoritativeProjection = projectionKeys.has(`${movement.productId}:${movement.branchId}`);
      if (!pendingMovementIds.has(movement.clientId) && hasAuthoritativeProjection) continue;
      stockByProduct.set(movement.productId, (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta);
    }
    return stockByProduct;
  }
  for (const movement of movements) {
    stockByProduct.set(
      movement.productId,
      (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
    );
  }
  return stockByProduct;
}

export async function getLowStockProductIds(
  defaultThreshold: number = LOW_STOCK_THRESHOLD,
  branchScope: StockBranchScope = null
): Promise<Set<string>> {
  const products = await tenantArray(db.products);
  const stockByProduct = await getStockByProduct(branchScope);

  return new Set(
    products
      .filter((product) => (stockByProduct.get(product.id) ?? 0) < (product.lowStockThreshold ?? defaultThreshold))
      .map((product) => product.id)
  );
}


/**
 * Already expired or expiring within EXPIRY_ALERT_WINDOW_DAYS. Only
 * products with expiryTracking on and a date set are eligible — "off" or
 * "optional with no date entered" never alert, per PRD 7.1 (expiry is
 * mandatory only for the Pharmacy/FMCG template).
 */
export async function getExpiringProductIds(
  windowDays: number = EXPIRY_ALERT_WINDOW_DAYS,
  branchScope: StockBranchScope = null
): Promise<Set<string>> {
  let products = await tenantArray(db.products);

  if (branchScope !== null) {
    // If filtering by branch, only consider products that have some stock at this branch.
    // Expiring alerts only make sense if you actually have the product in stock.
    const stockByProduct = await getStockByProduct(branchScope);
    products = products.filter((product) => (stockByProduct.get(product.id) ?? 0) > 0);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  return new Set(
    products
      .filter((product) => product.expiryTracking !== "off" && product.expiryDate && product.expiryDate <= cutoffIso)
      .map((product) => product.id)
  );
}

export async function getBestSellingProductIds(limit = 10): Promise<Set<string>> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sales = await tenantArray(db.sales
    .where("createdAtLocal")
    .aboveOrEqual(thirtyDaysAgo.toISOString())
    );

  const quantityByProduct = new Map<string, number>();
  for (const sale of sales) {
    if (sale.voidedAt) continue;
    for (const item of sale.items) {
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
    }
  }

  const ranked = [...quantityByProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  return new Set(ranked.map(([productId]) => productId));
}
