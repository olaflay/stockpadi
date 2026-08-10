"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getLowStockProductIds, getExpiringProductIds } from "@/features/inventory/product-insights";

export interface DashboardMetrics {
  hasAnyProducts: boolean;
  todaysSalesTotal: number;
  todaysSalesCount: number;
  todaysExpensesTotal: number;
  todaysPurchasesTotal: number;
  todaysCreditCollected: number;
  todaysCashSalesTotal: number;
  lowStockCount: number;
  expiringCount: number;
  unsyncedCount: number;
  topProducts: Array<{ id: string; name: string; sellPrice: number; currentStock: number }>;
  error: string | null;
}

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/**
 * Reads from IndexedDB only; renders whatever is cached locally and
 * recomputes automatically as sync writes new rows in. Optionally scoped to
 * one branch, otherwise consolidated across all branches. See
 * .agents/skills/scaffold-new-screen.md.
 */
/**
 * viewerId scopes sales-derived figures (todaysSalesTotal, cash flow, etc.)
 * to just that user's own sales — pass the current user's id for roles with
 * "own_only" view_sales permission (cashier), or null to see the full
 * branch/business totals. Mirrors the same scoping already applied on
 * src/app/(app)/sales/page.tsx so the two screens agree.
 */
export function useDashboardMetrics(branchId: string | null, viewerId: string | null = null): DashboardMetrics | undefined {
  return useLiveQuery(async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [products, recentSales, outboxPending, expenses, purchases, creditMovements] = await Promise.all([
        db.products.toArray(),
        db.sales
          .where("createdAtLocal")
          .aboveOrEqual(thirtyDaysAgo.toISOString())
          .toArray(),
        db.outbox.where("status").anyOf("pending", "syncing").count(),
        db.expenses.where("createdAtLocal").aboveOrEqual(startOfTodayIso()).toArray(),
        db.purchases.where("createdAtLocal").aboveOrEqual(startOfTodayIso()).toArray(),
        db.customerCreditMovements.where("createdAtLocal").aboveOrEqual(startOfTodayIso()).toArray(),
      ]);

      const todayStart = startOfTodayIso();
      const relevantSales = recentSales.filter(
        (sale) =>
          !sale.voidedAt &&
          sale.createdAtLocal >= todayStart &&
          (branchId === null || sale.branchId === branchId) &&
          (viewerId === null || sale.createdByUserId === viewerId)
      );

      const stockByProduct = new Map<string, number>();
      if (branchId !== null) {
        const movements = await db.stockMovements
          .where("branchId")
          .equals(branchId)
          .toArray();
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

      const lowStockIds = await getLowStockProductIds(undefined, branchId);
      const lowStockCount = lowStockIds.size;

      const expiringIds = await getExpiringProductIds(undefined, branchId);
      const expiringCount = expiringIds.size;

      // Frequency calculations for Quick Add (last 30 days)
      const freqMap: Record<string, number> = {};
      for (const sale of recentSales) {
        if (sale.voidedAt) continue;
        if (branchId !== null && sale.branchId !== branchId) continue;
        for (const item of sale.items) {
          freqMap[item.productId] = (freqMap[item.productId] ?? 0) + item.quantity;
        }
      }

      const sortedProductIdsByFreq = Object.keys(freqMap).sort((a, b) => freqMap[b] - freqMap[a]);
      
      // Select top 6 products that have positive stock
      let selectedProducts = sortedProductIdsByFreq
        .map(id => {
          const p = products.find(prod => prod.id === id);
          if (!p) return null;
          const qty = stockByProduct.get(p.id) ?? 0;
          return { id: p.id, name: p.name, sellPrice: p.sellPrice, currentStock: qty };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null && p.currentStock > 0);

      // If less than 6, backfill with remaining in-stock products
      if (selectedProducts.length < 6) {
        const remaining = products
          .filter(p => !sortedProductIdsByFreq.includes(p.id))
          .map(p => {
            const qty = stockByProduct.get(p.id) ?? 0;
            return { id: p.id, name: p.name, sellPrice: p.sellPrice, currentStock: qty };
          })
          .filter(p => p.currentStock > 0);
        selectedProducts = selectedProducts.concat(remaining);
      }

      const topProducts = selectedProducts.slice(0, 6);

      const relevantExpenses = expenses.filter((e) => branchId === null || e.branchId === branchId || !e.branchId);
      const todaysExpensesTotal = relevantExpenses.reduce((sum, e) => sum + e.amount, 0);

      const relevantPurchases = purchases.filter((p) => branchId === null || p.branchId === branchId);
      const todaysPurchasesTotal = relevantPurchases.reduce(
        (sum, p) => sum + p.items.reduce((lineSum, i) => lineSum + i.quantity * i.unitCost, 0),
        0
      );

      const todaysCashSalesTotal = relevantSales.reduce((sum, sale) => {
        const hasCredit = sale.payments.some(p => p.method === "credit");
        return hasCredit ? sum : sum + sale.total;
      }, 0);

      // Repayments are the only negative-amountDelta movements (credit sales
      // are always positive) — see recordCreditPayment in
      // src/features/customers/record-payment.ts.
      const todaysCreditCollected = creditMovements
        .filter((m) => m.amountDelta < 0)
        .reduce((sum, m) => sum + Math.abs(m.amountDelta), 0);

      return {
        hasAnyProducts: products.length > 0,
        todaysSalesTotal: relevantSales.reduce((sum, sale) => sum + sale.total, 0),
        todaysSalesCount: relevantSales.length,
        todaysExpensesTotal,
        todaysPurchasesTotal,
        todaysCashSalesTotal,
        todaysCreditCollected,
        lowStockCount,
        expiringCount,
        unsyncedCount: outboxPending,
        topProducts,
        error: null,
      } satisfies DashboardMetrics;
    } catch (err) {
      return {
        hasAnyProducts: false,
        todaysSalesTotal: 0,
        todaysSalesCount: 0,
        todaysExpensesTotal: 0,
        todaysPurchasesTotal: 0,
        todaysCashSalesTotal: 0,
        todaysCreditCollected: 0,
        lowStockCount: 0,
        expiringCount: 0,
        unsyncedCount: 0,
        topProducts: [],
        error: err instanceof Error ? err.message : "Could not read local data.",
      } satisfies DashboardMetrics;
    }
  }, [branchId, viewerId]);
}
