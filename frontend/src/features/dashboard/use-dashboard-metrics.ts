"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getLowStockProductIds, getExpiringProductIds } from "@/features/inventory/product-insights";
import { tenantArray } from "@/lib/local-tenant";
import { getStartOfTodayIso } from "@/lib/date";
import type { Purchase } from "@/types/purchase";

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
  inventoryValue: number;
  stockedProductCount: number;
  topProducts: Array<{ id: string; name: string; sellPrice: number; currentStock: number }>;
  error: string | null;
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

      const todayStart = getStartOfTodayIso();

      const [products, recentSales, outboxPending, expenses, purchases, creditMovements] = await Promise.all([
        tenantArray(db.products),
        tenantArray(db.sales
          .where("createdAtLocal")
          .aboveOrEqual(thirtyDaysAgo.toISOString())
          ),
        tenantArray(db.outbox.where("status").anyOf("pending", "syncing")),
        tenantArray(db.expenses.where("createdAtLocal").aboveOrEqual(todayStart)),
        tenantArray(db.purchases.where("createdAtLocal").aboveOrEqual(todayStart)),
        tenantArray(db.customerCreditMovements.where("createdAtLocal").aboveOrEqual(todayStart)),
      ]);
      const relevantSales = recentSales.filter(
        (sale) =>
          !sale.voidedAt &&
          sale.createdAtLocal >= todayStart &&
          (branchId === null || sale.branchId === branchId) &&
          (viewerId === null || sale.createdByUserId === viewerId)
      );

      const stockByProduct = new Map<string, number>();
      if (branchId !== null) {
        const movements = await tenantArray(db.stockMovements
          .where("branchId")
          .equals(branchId)
          );
        for (const movement of movements) {
          stockByProduct.set(
            movement.productId,
            (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
          );
        }
      } else {
        for (const movement of await tenantArray(db.stockMovements)) {
          stockByProduct.set(
            movement.productId,
            (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
          );
        }
      }

      // Hero figure: cost value of all stock on hand, plus how many products
      // actually carry stock. Counted only from the ledger-derived stock map,
      // never from a mutable quantity field (see .agents/rules/offline-sync-and-ledger.md).
      let inventoryValue = 0;
      let stockedProductCount = 0;
      for (const product of products) {
        const qty = stockByProduct.get(product.id) ?? 0;
        if (qty > 0) {
          stockedProductCount += 1;
          inventoryValue += qty * (product.costPrice ?? 0);
        }
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
        (sum: number, p: Purchase) => sum + p.items.reduce((lineSum: number, i) => lineSum + i.quantity * i.unitCost, 0),
        0
      );

      const todaysCashSalesTotal = relevantSales.reduce((sum, sale) => {
        const hasCredit = sale.payments.some((p: { method: string }) => p.method === "credit");
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
        unsyncedCount: outboxPending.length,
        inventoryValue,
        stockedProductCount,
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
        inventoryValue: 0,
        stockedProductCount: 0,
        topProducts: [],
        error: err instanceof Error ? err.message : "Could not read local data.",
      } satisfies DashboardMetrics;
    }
  }, [branchId, viewerId]);
}
