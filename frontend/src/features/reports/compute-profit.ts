import type { Sale, SaleItem } from "@/types/sale";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { SaleRefund } from "@/types/sale-refund";

/** A Purchase has no totalAmount field — its cost only exists as a sum over items[]. */
function purchaseTotal(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}

/**
 * Resolves the unit cost for a sale line item.
 *
 * TRUST Promise 4 (docs/COSTING-AND-PRICING.md):
 * Uses only the immutable snapshot recorded on the sale line at the point of sale.
 * If no snapshot exists (historical sale prior to snapshot migration), returns
 * null so reports can label historical cost as unavailable.
 */
export type HistoricalCostStatus = "exact" | "reconstructed" | "unavailable";

export interface HistoricalProfitMetrics {
  revenue: number;
  cogs: number | null;
  grossProfit: number | null;
  costStatus: HistoricalCostStatus;
  unavailableCostLines: number;
  reconstructedCostLines: number;
}

/**
 * Returns only the immutable cost recorded on the sale line.
 * Missing historical cost is unknown, never zero and never the current product cost.
 * The optional products parameter remains for source compatibility and is ignored.
 */
export function resolveItemUnitCost(item: SaleItem, _products?: Product[]): number | null {
  void _products;
  return item.unitCost !== undefined && item.unitCost !== null && Number.isFinite(item.unitCost)
    ? item.unitCost
    : null;
}

function itemCostStatus(item: SaleItem): "exact" | "reconstructed" | "unavailable" {
  if (resolveItemUnitCost(item) === null) return "unavailable";
  return item.costBasis === "provisional" || item.costBasis === "estimated_backfill"
    ? "reconstructed"
    : "exact";
}

export function computeHistoricalProfitMetrics(
  sales: Sale[],
  refunds: SaleRefund[] = [],
): HistoricalProfitMetrics {
  const activeSales = sales.filter((sale) => !sale.voidedAt);
  const revenue = activeSales.reduce((sum, sale) => sum + sale.total, 0)
    - refunds.reduce((sum, refund) => sum + refund.totalRefunded, 0);
  let cogs = 0;
  let unavailableCostLines = 0;
  let reconstructedCostLines = 0;

  for (const sale of activeSales) {
    for (const item of sale.items) {
      const unitCost = resolveItemUnitCost(item);
      if (unitCost === null) unavailableCostLines += 1;
      else {
        cogs += unitCost * item.quantity;
        if (itemCostStatus(item) === "reconstructed") reconstructedCostLines += 1;
      }
    }
  }

  for (const refund of refunds) {
    const sale = sales.find((candidate) => candidate.id === refund.saleId);
    if (!sale) {
      unavailableCostLines += refund.items.length;
      continue;
    }
    for (const refundItem of refund.items) {
      const original = sale.items.find((item) => item.productId === refundItem.productId);
      if (!original) {
        unavailableCostLines += 1;
        continue;
      }
      const unitCost = resolveItemUnitCost(original);
      if (unitCost === null) unavailableCostLines += 1;
      else {
        cogs -= unitCost * refundItem.quantity;
        if (itemCostStatus(original) === "reconstructed") reconstructedCostLines += 1;
      }
    }
  }

  const costStatus: HistoricalCostStatus = unavailableCostLines > 0
    ? "unavailable"
    : reconstructedCostLines > 0
    ? "reconstructed"
    : "exact";

  return {
    revenue,
    cogs: costStatus === "unavailable" ? null : cogs,
    grossProfit: costStatus === "unavailable" ? null : revenue - cogs,
    costStatus,
    unavailableCostLines,
    reconstructedCostLines,
  };
}

/**
 * Computes the gross profit for a set of sales.
 * Uses immutable sale totals and line cost snapshots. A sale with an unknown
 * cost never produces a fabricated profit figure.
 */
export function computeGrossProfit(sales: Sale[], _products?: Product[], refunds: SaleRefund[] = []): number | null {
  return computeHistoricalProfitMetrics(sales, refunds).grossProfit;
}

/**
 * Computes Cost of Goods Sold (COGS) based on immutable line snapshots.
 */
export function computeCogs(sales: Sale[], _products?: Product[], refunds: SaleRefund[] = []): number | null {
  return computeHistoricalProfitMetrics(sales, refunds).cogs;
}

/**
 * Computes net profit by subtracting total expenses from the gross profit.
 */
export function computeNetProfit(grossProfit: number | null, expenses: Expense[]): number | null {
  if (grossProfit === null) return null;
  return grossProfit - expenses.reduce((sum, expense) => sum + expense.amount, 0);
}

/**
 * Computes net cash flow by taking cash/immediate sales (excluding credit payments),
 * subtracting expenses and purchases, and adding collected credit.
 * In a mixed-payment sale (e.g. ₦9,000 cash + ₦1,000 credit), the non-credit
 * payments are included in cash flow.
 */
export function computeNetCashFlow(
  sales: Sale[],
  expenses: Expense[],
  purchases: Purchase[],
  creditCollected: number,
  refunds: SaleRefund[] = [],
): number {
  const cashSalesTotal = sales.reduce((sum, sale) => {
    if (sale.voidedAt) return sum;
    const paidAmount = (sale.payments ?? [])
      .filter((p) => p.method !== "credit")
      .reduce((paymentSum, p) => paymentSum + p.amount, 0);
    return sum + paidAmount;
  }, 0);

  const cashRefundsTotal = refunds.reduce((sum, refund) => sum + refund.payments
    .filter((payment) => payment.method !== "credit")
    .reduce((paymentSum, payment) => paymentSum + payment.amount, 0), 0);
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const purchasesTotal = purchases.reduce((sum, p) => sum + purchaseTotal(p), 0);

  return cashSalesTotal - cashRefundsTotal - expensesTotal - purchasesTotal + creditCollected;
}
