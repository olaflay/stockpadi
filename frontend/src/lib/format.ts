/**
 * Currency and date format are never hardcoded per PRD Section 8; this reads
 * the business's configured currency. Zero decimal places: kobo has not
 * meaningfully circulated in Nigerian retail in years, and two decimals on
 * every displayed amount is visual noise a cashier re-reads under time
 * pressure. See finding 1.1-E in docs/RESEARCH-AND-PLAN.md.
 */
export function formatCurrency(amount: number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export { formatShortDate, isoDateFromShort } from "@/lib/date";
