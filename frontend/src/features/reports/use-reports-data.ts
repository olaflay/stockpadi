import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID, type CustomerCreditMovement } from "@/lib/db";
import { getLowStockProductIds } from "@/features/inventory/product-insights";
import { computeGrossProfit, computeNetProfit, computeNetCashFlow } from "./compute-profit";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";
import { serverGet, NetworkUnavailableError } from "@/features/operations/server-client";
import { tenantArray } from "@/lib/local-tenant";

export type Period = "today" | "week" | "month";

export const PERIOD_LABELS: Record<Period, string> = { today: "Today", week: "This week", month: "This month" };

type ReportPayment = { method: "cash" | "transfer" | "pos_terminal" | "credit"; amount: number };
type ReportItem = { product_id: string; quantity: number; unit_price: number; discount: number; unit_label: string; unit_conversion_factor: number };
type ReportSale = { id: string; client_id?: string; branch_id: string; customer_id?: string | null; subtotal: number; discount: number; total: number; created_at: string; created_by_user_id: string; voided_at?: string | null; items?: ReportItem[]; payments?: ReportPayment[] };
type ReportProduct = { id: string; name: string; sku: string; cost_price: number; sell_price: number; low_stock_threshold: number | null };
type ReportExpense = { id: string; branch_id: string | null; category: string; amount: number; note: string | null; created_at: string; created_by_user_id: string };
type ReportPurchaseItem = { product_id: string; quantity: number; unit_cost: number };
type ReportPurchase = { id: string; client_id?: string; branch_id: string; supplier_id: string; created_at: string; items?: ReportPurchaseItem[] };
type ReportStock = { product_id: string; quantity: number };
type ReportResponse = { sales?: ReportSale[]; products?: ReportProduct[]; expenses?: ReportExpense[]; purchases?: ReportPurchase[]; stock?: ReportStock[] };

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
      try {
        const remote = await serverGet<ReportResponse>(`/api/reports/summary?from=${encodeURIComponent(start)}&to=${encodeURIComponent(new Date().toISOString())}`);
        const sales: Sale[] = (remote.sales ?? []).map((sale) => ({ id: sale.id, clientId: sale.client_id ?? sale.id, branchId: sale.branch_id, customerId: sale.customer_id ?? null, subtotal: Number(sale.subtotal), discount: Number(sale.discount), total: Number(sale.total), createdAtLocal: sale.created_at, createdAt: sale.created_at, createdByUserId: sale.created_by_user_id, voidedAt: sale.voided_at ?? null, items: (sale.items ?? []).map((item) => ({ productId: item.product_id, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), discount: Number(item.discount), unitLabel: item.unit_label, conversionFactor: Number(item.unit_conversion_factor), movementClientId: "server" })), payments: (sale.payments ?? []).map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) }));
        const products: Product[] = (remote.products ?? []).map((product) => ({ id: product.id, name: product.name, sku: product.sku, barcode: null, categoryId: null, brandId: null, unitLabel: "piece", altUnitLabel: null, altUnitConversionFactor: null, altUnitSellPrice: null, costPrice: Number(product.cost_price), sellPrice: Number(product.sell_price), expiryTracking: "off", expiryDate: null, lowStockThreshold: product.low_stock_threshold, version: 1, updatedAt: new Date().toISOString() }));
        const expenses: Expense[] = (remote.expenses ?? []).map((expense) => ({ id: expense.id, branchId: expense.branch_id, category: expense.category, amount: Number(expense.amount), note: expense.note, createdAtLocal: expense.created_at, createdByUserId: expense.created_by_user_id }));
        const purchases: Purchase[] = (remote.purchases ?? []).map((purchase) => ({ id: purchase.id, clientId: purchase.client_id ?? purchase.id, branchId: purchase.branch_id, supplierId: purchase.supplier_id, createdAtLocal: purchase.created_at, createdAt: purchase.created_at, createdByUserId: "server", items: (purchase.items ?? []).map((item) => ({ productId: item.product_id, quantity: Number(item.quantity), unitCost: Number(item.unit_cost), movementClientId: "server" })) }));
        const stockByProduct = new Map<string, number>();
        for (const row of remote.stock ?? []) stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) ?? 0) + Number(row.quantity));
        const lowStockIds = new Set(products.filter((product) => product.lowStockThreshold !== null && (stockByProduct.get(product.id) ?? 0) <= product.lowStockThreshold).map((product) => product.id));
        return { sales, products, stockByProduct, profile: undefined, expenses, purchases, creditMovements: [], lowStockIds, serverSummary: remote, error: null as string | null };
      } catch (error) {
        if (!(error instanceof NetworkUnavailableError) && typeof navigator !== "undefined" && navigator.onLine) throw error;
        /* offline uses the local snapshot below */
      }
      const [sales, products, profile, expenses, purchases, creditMovements] = await Promise.all([
        tenantArray<Sale>(db.sales
          .where("createdAtLocal")
          .aboveOrEqual(start)
          ),
        tenantArray<Product>(db.products),
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
        tenantArray<Expense>(db.expenses
          .where("createdAtLocal")
          .aboveOrEqual(start)
          ),
        tenantArray<Purchase>(db.purchases
          .where("createdAtLocal")
          .aboveOrEqual(start)
          ),
        tenantArray<CustomerCreditMovement>(db.customerCreditMovements
          .where("createdAtLocal")
          .aboveOrEqual(start)
          ),
      ]);

      const stockByProduct = new Map<string, number>();
      const movements = await tenantArray<StockMovement>(db.stockMovements);
      for (const movement of movements) {
        stockByProduct.set(
          movement.productId,
          (stockByProduct.get(movement.productId) ?? 0) + movement.quantityDelta
        );
      }

      const lowStockIds = await getLowStockProductIds();

      return { sales, products, stockByProduct, profile, expenses, purchases, creditMovements, lowStockIds, serverSummary: null, error: null as string | null };
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
  const lowStockProducts = products.filter((product: Product) => lowStockIds.has(product.id));

  const periodSales: Sale[] = result && !result.error ? result.sales.filter((sale: Sale) => !sale.voidedAt) : [];
  const periodExpenses: Expense[] = result && !result.error ? result.expenses : [];
  const periodExpensesTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const periodPurchases: Purchase[] = result && !result.error ? result.purchases : [];
  const periodPurchasesTotal = periodPurchases.reduce(
    (sum: number, p: Purchase) => sum + p.items.reduce((lineSum, i) => lineSum + i.quantity * i.unitCost, 0),
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
      product: products.find((p: Product) => p.id === productId),
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
