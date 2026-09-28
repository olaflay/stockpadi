import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { getPendingStockMovementIds } from "@/features/inventory/stock";
import type { Product } from "@/types/product";

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
 * The single definition of "how much stock does this product have left", and
 * therefore the single definition of what counts as low. Before this existed
 * the same business meaning was computed four different ways across the app
 * (product-insights.ts, products/page.tsx, BrowseStep.tsx, InventoryView.tsx)
 * with a different comparison operator and a different null-handling rule in
 * each, so the Products row could warn "low" while the filter chip that
 * produced the row excluded the very product it was warning about.
 *
 * `undefined` is deliberately NOT collapsed to 0. A product created with a
 * blank starting stock writes no ledger row at all (see
 * product-offline-write.ts), so `undefined` means "no stock is being tracked
 * for this product" — an absence of data, not a quantity of zero. Rendering
 * it as a red "Out of stock" states a fact the ledger does not support.
 */
export type StockStatus = "out" | "low" | "ok" | "untracked";

export function resolveStockStatus(
  quantity: number | undefined,
  lowStockThreshold?: number | null
): StockStatus {
  if (quantity === undefined || Number.isNaN(quantity)) return "untracked";
  if (quantity <= 0) return "out";
  // A reorder point of 5 means "at or below 5, reorder" — the same reading a
  // shop owner gives the number they typed into the product form.
  const threshold = lowStockThreshold ?? LOW_STOCK_THRESHOLD;
  return quantity <= threshold ? "low" : "ok";
}

/** Returns true if a product is low on stock (at or below threshold, but > 0). */
export function isLowStock(
  quantity: number | undefined,
  lowStockThreshold?: number | null
): boolean {
  return resolveStockStatus(quantity, lowStockThreshold) === "low";
}

/** Returns true if a product is out of stock (<= 0). */
export function isOutOfStock(quantity: number | undefined): boolean {
  return resolveStockStatus(quantity) === "out";
}

/** Plain-language label for a stock status, as the cashier reads it. */
export function stockStatusLabel(status: StockStatus, quantity?: number): string {
  if (status === "untracked") return "No stock tracked";
  if (status === "out") return "Out of stock";
  if (status === "low") return `Only ${quantity} left`;
  return `${quantity} in stock`;
}

/** True when the quantity cannot cover the requested amount. Untracked is not
 *  treated as "enough" — callers decide separately whether to block or warn. */
export function isShortOnStock(
  quantity: number | undefined,
  requested: number
): boolean {
  if (quantity === undefined) return true;
  return quantity < requested;
}

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
  branchScope: StockBranchScope = null,
  cachedProducts?: Product[],
  cachedStock?: Map<string, number>
): Promise<Set<string>> {
  const products = cachedProducts ?? (await tenantArray(db.products));
  const stockByProduct = cachedStock ?? (await getStockByProduct(branchScope));

  return new Set(
    products
      .filter((product) => {
        const status = resolveStockStatus(
          stockByProduct.get(product.id),
          product.lowStockThreshold ?? defaultThreshold
        );
        // Untracked counts as needing attention: the owner asked for a low
        // stock list, and a product nothing has ever been recorded against is
        // exactly the one they have to go count. It is filtered in here but
        // never rendered as "out of stock" — see stockStatusLabel.
        return status === "untracked" || status === "out" || status === "low";
      })
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
  branchScope: StockBranchScope = null,
  cachedProducts?: Product[],
  cachedStock?: Map<string, number>
): Promise<Set<string>> {
  let products = cachedProducts ?? (await tenantArray(db.products));

  if (branchScope !== null) {
    // If filtering by branch, only consider products that have some stock at this branch.
    // Expiring alerts only make sense if you actually have the product in stock.
    const stockByProduct = cachedStock ?? (await getStockByProduct(branchScope));
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
