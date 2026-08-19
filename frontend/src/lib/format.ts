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

/**
 * "01/09/26" — dd/mm/yy, never the native date input's browser/locale-
 * dependent display (which can't be forced to a single consistent format
 * across browsers). `isoDate` is "YYYY-MM-DD" as stored everywhere else
 * (Product.expiryDate). Returns "" for an empty/invalid input.
 */
export function formatShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year.slice(2)}`;
}

/** Inverse of formatShortDate: "01/09/26" -> "2026-09-01". Returns null while incomplete/invalid. */
export function isoDateFromShort(shortDate: string): string | null {
  const match = shortDate.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `20${year}-${month}-${day}`;
}
