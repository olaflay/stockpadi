import { getBrandingConfig } from "@/config/branding";

/**
 * Currency and date format are never hardcoded per PRD Section 8; this reads
 * the business's configured currency. Zero decimal places: kobo has not
 * meaningfully circulated in Nigerian retail in years, and two decimals on
 * every displayed amount is visual noise a cashier re-reads under time
 * pressure. See finding 1.1-E in docs/RESEARCH-AND-PLAN.md.
 */
export function formatCurrency(amount: number, currency?: string): string {
  const activeCurrency = currency || getBrandingConfig().currency || "NGN";
  const locale = activeCurrency === "NGN" ? "en-NG" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: activeCurrency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Returns the currency symbol or prefix label for labels and placeholders (e.g. "₦", "$", "GHS").
 */
export function formatCurrencyLabel(currency?: string): string {
  const activeCurrency = currency || getBrandingConfig().currency || "NGN";
  try {
    const locale = activeCurrency === "NGN" ? "en-NG" : "en-US";
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: activeCurrency,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const currencyPart = parts.find((p) => p.type === "currency");
    return currencyPart ? currencyPart.value : (activeCurrency === "NGN" ? "₦" : activeCurrency);
  } catch {
    return activeCurrency === "NGN" ? "₦" : activeCurrency;
  }
}

export { formatShortDate, isoDateFromShort } from "@/lib/date";
