import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID, type CustomerCreditMovement } from "@/lib/db";
import { getLowStockProductIds } from "@/features/inventory/product-insights";
import { computeGrossProfit, computeNetProfit, computeNetCashFlow } from "./compute-profit";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";

export type Period = "today" | "week" | "month";

export const PERIOD_LABELS: Record<Period, string> = { today: "Today", week: "This week", month: "This month" };

function periodStartIso(period: Period): string {
  const now = new Date();
  if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (period === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

/**
 * Period selection plus the sales/expenses/purchases/stock data behind the
 * Reports screen, and the derived totals and lists (best sellers, low
 * stock) the presentational components render.
 */
export function useReportsData() {
  const [period, setPeriod] = useState<Period>("today");

  const result = useLiveQuery(async () => {
    try {
      const start = periodStartIso(period);
      const [sales, products, profile, expenses, purchases, creditMovements] = await Promise.all([
        db.sales
          .where("createdAtLocal")
          .aboveOrEqual(start)
          .toArray(),
        db.products.toArray(),
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
        db.expenses
          .where("createdAtLocal")
          .aboveOrEqual(start)
          .toArray(),
        db.purchases
          .where("createdAtLocal")
          .aboveOrEqual(start)
          .toArray(),
        db.customerCreditMovements
          .where("createdAtLocal")
          .aboveOrEqual(start)
          .toArray(),
      ]);

      const stockByProduct = new Map<string, number>();
      await db.stockMovements.each((movement) => {
        stockByProduct.set(
          movement.productId,
          (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
        );
      });

      const lowStockIds = await getLowStockProductIds();

      return { sales, products, stockByProduct, profile, expenses, purchases, creditMovements, lowStockIds, error: null as string | null };
    } catch (err) {
      return {
        sales: [] as Sale[],
        products: [] as Product[],
        stockByProduct: new Map<string, number>(),
        lowStockIds: new Set<string>(),
        profile: undefined,
        expenses: [] as Expense[],
        purchases: [] as Purchase[],
        creditMovements: [] as CustomerCreditMovement[],
        error: err instanceof Error ? err.message : "Could not load report data.",
      };
    }
  }, [period]);

  const products = result?.products ?? [];
  const lowStockIds = result?.lowStockIds ?? new Set<string>();
  const lowStockProducts = products.filter((product) => lowStockIds.has(product.id));

  const periodSales: Sale[] = result && !result.error ? result.sales.filter((sale) => !sale.voidedAt) : [];
  const periodExpenses: Expense[] = result && !result.error ? result.expenses : [];
  const periodExpensesTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const periodPurchases: Purchase[] = result && !result.error ? result.purchases : [];
  const periodPurchasesTotal = periodPurchases.reduce(
    (sum, p) => sum + p.items.reduce((lineSum, i) => lineSum + i.quantity * i.unitCost, 0),
    0
  );

  const quantityByProduct = new Map<string, number>();
  for (const sale of periodSales) {
    for (const item of sale.items) {
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
    }
  }
  const bestSellers: { product: Product | undefined; quantity: number }[] = [...quantityByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, quantity]) => ({
      product: products.find((p) => p.id === productId),
      quantity,
    }));

  const periodGrossProfit = computeGrossProfit(periodSales, products);
  const periodNetProfit = computeNetProfit(periodGrossProfit, periodExpenses);
  // Repayments are the only negative-amountDelta movements (credit sales are
  // always positive) — see recordCreditPayment in src/features/customers/record-payment.ts.
  const creditCollected = (result?.creditMovements ?? [])
    .filter((m) => m.amountDelta < 0)
    .reduce((sum, m) => sum + Math.abs(m.amountDelta), 0);
  const periodNetCashFlow = computeNetCashFlow(periodSales, periodExpenses, periodPurchases, creditCollected);

  return {
    period,
    setPeriod,
    result,
    lowStockProducts,
    periodSales,
    periodExpenses,
    periodExpensesTotal,
    periodPurchases,
    periodPurchasesTotal,
    bestSellers,
    periodGrossProfit,
    periodNetProfit,
    periodNetCashFlow,
  };
}
