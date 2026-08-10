import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";

/** A Purchase has no totalAmount field — its cost only exists as a sum over items[]. */
function purchaseTotal(purchase: Purchase): number {
  return purchase.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
}

/**
 * Computes the gross profit for a set of sales, using the *current* cost price
 * of the products. Note: Since `SaleItem` doesn't snapshot cost at the time of sale,
 * this is an estimate that may diverge from actual margins if costs have changed
 * significantly since the sale was made.
 */
export function computeGrossProfit(sales: Sale[], products: Product[]): number {
  let grossProfit = 0;
  for (const sale of sales) {
    if (sale.voidedAt) continue;
    for (const item of sale.items) {
      const prod = products.find((p) => p.id === item.productId);
      const cost = prod ? prod.costPrice : 0;
      grossProfit += (item.unitPrice - item.discount - cost) * item.quantity;
    }
  }
  return grossProfit;
}

/**
 * Computes net profit by subtracting total expenses from the gross profit.
 */
export function computeNetProfit(grossProfit: number, expenses: Expense[]): number {
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  return grossProfit - expensesTotal;
}

/**
 * Computes net cash flow by taking cash sales (excluding credit), 
 * subtracting expenses and purchases, and adding collected credit.
 */
export function computeNetCashFlow(
  sales: Sale[],
  expenses: Expense[],
  purchases: Purchase[],
  creditCollected: number
): number {
  const cashSalesTotal = sales.reduce((sum, sale) => {
    if (sale.voidedAt) return sum;
    const hasCredit = sale.payments.some(p => p.method === "credit");
    return hasCredit ? sum : sum + sale.total;
  }, 0);

  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const purchasesTotal = purchases.reduce((sum, p) => sum + purchaseTotal(p), 0);

  return cashSalesTotal - expensesTotal - purchasesTotal + creditCollected;
}
