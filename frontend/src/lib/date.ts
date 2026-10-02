/**
 * Single source of truth for date and time calculations in OjàPadi.
 * Handles local timezone midnight boundaries (WAT / UTC+1) accurately
 * so that offline ledger queries never clip transactions across days.
 */

export type ReportPeriod = "today" | "yesterday" | "week" | "month" | "all_time" | "custom";

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
 * Returns the ISO 8601 UTC timestamp representing 00:00:00.000 local time yesterday.
 */
export function getStartOfYesterdayIso(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns the ISO 8601 UTC timestamp representing 23:59:59.999 local time yesterday.
 */
export function getEndOfYesterdayIso(referenceDate = new Date()): string {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - 1);
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
 * Maps a report period to its start and optional end bounds.
 */
export function getPeriodBoundsIso(
  period: ReportPeriod,
  referenceDate = new Date(),
  customRange?: { start: string; end: string }
): { start: string; end?: string } {
  switch (period) {
    case "today":
      return { start: getStartOfTodayIso(referenceDate) };
    case "yesterday":
      return { start: getStartOfYesterdayIso(referenceDate), end: getEndOfYesterdayIso(referenceDate) };
    case "week":
      return { start: getStartOfWeekIso(referenceDate) };
    case "month":
      return { start: getStartOfMonthIso(referenceDate) };
    case "all_time":
      return { start: "1970-01-01T00:00:00.000Z" };
    case "custom": {
      let endIso: string | undefined = undefined;
      if (customRange?.end) {
        const endDate = new Date(customRange.end);
        if (/^\d{4}-\d{2}-\d{2}$/.test(customRange.end)) {
          endDate.setHours(23, 59, 59, 999);
        }
        endIso = endDate.toISOString();
      }
      return {
        start: customRange?.start ? new Date(customRange.start).toISOString() : getStartOfTodayIso(referenceDate),
        end: endIso,
      };
    }
  }
}

/**
 * Backwards-compatible period start mapping.
 */
export function getPeriodStartIso(period: ReportPeriod, referenceDate = new Date()): string {
  return getPeriodBoundsIso(period, referenceDate).start;
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
