import { formatCurrency } from "@/lib/format";

function formatUnits(units: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 3 }).format(units);
}

export function expenseOutcomeMessage(category: string, amount: number): string {
  return `Expense saved · ${category} · ${formatCurrency(amount)}`;
}

export function deliveryOutcomeMessage(totalUnits: number, totalCost: number): string {
  return `Delivery saved · ${formatUnits(totalUnits)} units · ${formatCurrency(totalCost)}. Stock increased.`;
}
