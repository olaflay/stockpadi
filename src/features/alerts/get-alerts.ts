import { db } from "@/lib/db";
import { getLowStockProductIds, getExpiringProductIds } from "@/features/inventory/product-insights";

export type AlertType = "low_stock" | "expiring" | "unsynced";

export interface Alert {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  href: string;
}

/**
 * Full detailed alert list — only for the /alerts page itself. Everywhere
 * else (the globally-mounted nav badge, the dashboard summary) only needs a
 * count; see getAlertCounts() below, which skips the per-product fetch and
 * description strings entirely.
 */
export async function getAlerts(unsyncedCount: number): Promise<Alert[]> {
  const alerts: Alert[] = [];

  if (unsyncedCount > 0) {
    alerts.push({
      id: "unsynced-outbox",
      type: "unsynced",
      title: "Unsynced Changes",
      description: `${unsyncedCount} change${unsyncedCount === 1 ? "" : "s"} waiting to sync.`,
      href: "/settings/data",
    });
  }

  const [lowStockIds, expiringIds] = await Promise.all([getLowStockProductIds(), getExpiringProductIds()]);

  // Fetch only the flagged products by id instead of scanning the entire
  // products table a third time (getLowStockProductIds and
  // getExpiringProductIds each already do their own full scan internally).
  const flaggedIds = [...new Set([...lowStockIds, ...expiringIds])];
  const flaggedProducts = await db.products.bulkGet(flaggedIds);

  for (const product of flaggedProducts) {
    if (!product) continue;

    if (lowStockIds.has(product.id)) {
      alerts.push({
        id: `low-stock-${product.id}`,
        type: "low_stock",
        title: "Low Stock",
        description: `${product.name} is running low.`,
        href: `/products/${product.id}`,
      });
    }

    if (expiringIds.has(product.id)) {
      alerts.push({
        id: `expiring-${product.id}`,
        type: "expiring",
        title: "Expiring Soon",
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
export async function getAlertCounts(unsyncedCount: number, acknowledgedIds?: Set<string>): Promise<number> {
  const [lowStockIds, expiringIds] = await Promise.all([getLowStockProductIds(), getExpiringProductIds()]);
  let count = 0;
  if (unsyncedCount > 0 && !acknowledgedIds?.has("unsynced-outbox")) count++;
  for (const id of lowStockIds) if (!acknowledgedIds?.has(`low-stock-${id}`)) count++;
  for (const id of expiringIds) if (!acknowledgedIds?.has(`expiring-${id}`)) count++;
  return count;
}
