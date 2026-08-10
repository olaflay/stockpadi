import { db } from "@/lib/db";

/**
 * Shared read-only helpers for "which products need attention" — used by
 * the Products page filter chips. Reuses the same threshold constant and
 * stock/sales aggregation shape already established in
 * use-dashboard-metrics.ts and reports/page.tsx, so all three screens agree
 * on what "low stock" and "best selling" mean.
 */

export const LOW_STOCK_THRESHOLD = 5;
export const EXPIRY_ALERT_WINDOW_DAYS = 7;

export async function getLowStockProductIds(
  defaultThreshold: number = LOW_STOCK_THRESHOLD,
  branchId: string | null = null
): Promise<Set<string>> {
  const products = await db.products.toArray();

  const stockByProduct = new Map<string, number>();
  if (branchId !== null) {
    const movements = await db.stockMovements.where("branchId").equals(branchId).toArray();
    for (const movement of movements) {
      stockByProduct.set(
        movement.productId,
        (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
      );
    }
  } else {
    await db.stockMovements.each((movement) => {
      stockByProduct.set(
        movement.productId,
        (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
      );
    });
  }

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
  branchId: string | null = null
): Promise<Set<string>> {
  let products = await db.products.toArray();

  if (branchId !== null) {
    // If filtering by branch, only consider products that have some stock at this branch.
    // Expiring alerts only make sense if you actually have the product in stock.
    const stockByProduct = new Map<string, number>();
    const movements = await db.stockMovements.where("branchId").equals(branchId).toArray();
    for (const movement of movements) {
      stockByProduct.set(
        movement.productId,
        (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
      );
    }
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

  const sales = await db.sales
    .where("createdAtLocal")
    .aboveOrEqual(thirtyDaysAgo.toISOString())
    .toArray();

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
