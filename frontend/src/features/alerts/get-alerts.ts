import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import {
  getLowStockProductIds,
  getExpiringProductIds,
  getStockByProduct,
  LOW_STOCK_THRESHOLD,
  EXPIRY_ALERT_WINDOW_DAYS,
  type StockBranchScope,
} from "@/features/inventory/product-insights";

export type AlertType = "low_stock" | "expiring" | "unsynced";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  href: string;
}

export interface AlertQueryOptions {
  /** Limit stock calculations to the branches assigned to a worker. */
  branchScope?: StockBranchScope;
  /** Workers need operational low-stock warnings, not owner-level system alerts. */
  lowStockOnly?: boolean;
}

/**
 * Full detailed alert list — only for the /alerts page itself. Everywhere
 * else (the globally-mounted nav badge, the dashboard summary) only needs a
 * count; see getAlertCounts() below, which skips the per-product fetch and
 * description strings entirely.
 */
export async function getAlerts(unsyncedCount: number, options: AlertQueryOptions = {}): Promise<Alert[]> {
  const alerts: Alert[] = [];
  const branchScope = options.branchScope ?? null;
  const lowStockOnly = options.lowStockOnly ?? false;

  // A worker without an assigned branch must not see another branch's stock.
  if (Array.isArray(branchScope) && branchScope.length === 0) return alerts;

  if (!lowStockOnly && unsyncedCount > 0) {
    alerts.push({
      id: "unsynced-outbox",
      type: "unsynced",
      title: "Unsynced changes",
      description: `${unsyncedCount} change${unsyncedCount === 1 ? "" : "s"} waiting to sync.`,
      href: "/settings/data",
    });
  }

  const [products, stockByProduct] = await Promise.all([
    tenantArray(db.products),
    getStockByProduct(branchScope),
  ]);

  const [detectedLowStockIds, expiringIds] = await Promise.all([
    getLowStockProductIds(LOW_STOCK_THRESHOLD, branchScope, products, stockByProduct),
    lowStockOnly
      ? Promise.resolve(new Set<string>())
      : getExpiringProductIds(EXPIRY_ALERT_WINDOW_DAYS, branchScope, products, stockByProduct),
  ]);
  // A catalogue is shared across branches. For worker alerts, only surface
  // products that have a stock record in one of the worker's branches; an
  // absent branch row is not proof that the product is low there.
  const lowStockIds = lowStockOnly
    ? new Set([...detectedLowStockIds].filter((id) => stockByProduct.has(id)))
    : detectedLowStockIds;

  const flaggedIds = new Set([...lowStockIds, ...expiringIds]);
  const flaggedProducts = products.filter((product) => flaggedIds.has(product.id));

  for (const product of flaggedProducts) {
    if (!product) continue;

    if (lowStockIds.has(product.id)) {
      alerts.push({
        id: `low-stock-${product.id}`,
        type: "low_stock",
        title: "Low stock",
        description: `${product.name} is running low.`,
        href: `/products/${product.id}`,
      });
    }

    if (expiringIds.has(product.id)) {
      alerts.push({
        id: `expiring-${product.id}`,
        type: "expiring",
        title: "Expiring soon",
        description: `${product.name} is expiring soon or already expired.`,
        href: `/products/${product.id}`,
      });
    }
  }

  return alerts;
}

/**
 * Count-only variant for high-frequency call sites (the nav badge, mounted
 * on every authenticated screen; the dashboard summary tile) — skips the
 * products.bulkGet + description-string work in getAlerts entirely, since
 * those consumers only ever render a number. Still respects acknowledged
 * alerts (built from bare product ids, never needs to fetch a product row).
 */
export async function getAlertCounts(
  unsyncedCount: number,
  acknowledgedIds?: Set<string>,
  options: AlertQueryOptions = {},
): Promise<number> {
  const branchScope = options.branchScope ?? null;
  const lowStockOnly = options.lowStockOnly ?? false;

  if (Array.isArray(branchScope) && branchScope.length === 0) return 0;

  const [products, stockByProduct] = await Promise.all([
    tenantArray(db.products),
    getStockByProduct(branchScope),
  ]);

  const [detectedLowStockIds, expiringIds] = await Promise.all([
    getLowStockProductIds(LOW_STOCK_THRESHOLD, branchScope, products, stockByProduct),
    lowStockOnly
      ? Promise.resolve(new Set<string>())
      : getExpiringProductIds(EXPIRY_ALERT_WINDOW_DAYS, branchScope, products, stockByProduct),
  ]);
  const lowStockIds = lowStockOnly
    ? new Set([...detectedLowStockIds].filter((id) => stockByProduct.has(id)))
    : detectedLowStockIds;

  let count = 0;
  if (!lowStockOnly && unsyncedCount > 0 && !acknowledgedIds?.has("unsynced-outbox")) count++;
  for (const id of lowStockIds) if (!acknowledgedIds?.has(`low-stock-${id}`)) count++;
  for (const id of expiringIds) if (!acknowledgedIds?.has(`expiring-${id}`)) count++;
  return count;
}
