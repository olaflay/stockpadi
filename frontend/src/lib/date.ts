/**
 * Single source of truth for date and time calculations in StockPadi.
 * Handles local timezone midnight boundaries (WAT / UTC+1) accurately
 * so that offline ledger queries never clip transactions across days.
 */

export type ReportPeriod = "today" | "week" | "month";

/**
 * Returns the ISO 8601 UTC timestamp representing 00:00:00.000 local time today.
 * e.g., On a device in Lagos (UTC+1) on Aug 30 2026, 00:00 local time is "2026-08-29T23:00:00.000Z".
 */
export function getStartOfTodayIso(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns the ISO 8601 UTC timestamp representing 23:59:59.999 local time today.
 */
export function getEndOfTodayIso(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Returns the ISO timestamp for the start of the week (00:00:00.000 local time).
 * Default week start is Sunday (matching existing reports/tests and JS convention).
 */
export function getStartOfWeekIso(referenceDate = new Date(), weekStartsOn: "sunday" | "monday" = "sunday"): string {
  const d = new Date(referenceDate);
  const day = d.getDay();
  const diff = weekStartsOn === "monday" ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns the ISO timestamp for the 1st of the current month (00:00:00.000 local time).
 */
export function getStartOfMonthIso(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Maps a report period ("today" | "week" | "month") to its start ISO timestamp.
 */
export function getPeriodStartIso(period: ReportPeriod, referenceDate = new Date()): string {
  switch (period) {
    case "today":
      return getStartOfTodayIso(referenceDate);
    case "week":
      return getStartOfWeekIso(referenceDate);
    case "month":
      return getStartOfMonthIso(referenceDate);
  }
}

/**
 * Checks if two ISO timestamps fell on the same calendar day in the device's local timezone.
 */
export function isSameLocalDay(dateA: string | Date, dateB: string | Date): boolean {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formats an ISO "YYYY-MM-DD" date into "dd/mm/yy" (e.g. "01/09/26") for compact mobile display.
 */
export function formatShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${day}/${month}/${year.slice(2)}`;
}

/**
 * Inverse of formatShortDate: "01/09/26" -> "2026-09-01". Returns null while incomplete/invalid.
 */
export function isoDateFromShort(shortDate: string): string | null {
  const match = shortDate.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const numDay = Number(day);
  const numMonth = Number(month);
  if (numMonth < 1 || numMonth > 12 || numDay < 1 || numDay > 31) return null;
  return `20${year}-${month}-${day}`;
}

// Backwards-compatible aliases
export const formatExpiryForDisplay = formatShortDate;
export const parseShortExpiryInput = isoDateFromShort;
