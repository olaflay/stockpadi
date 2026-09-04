export const RESTOCK_MAX_QUANTITY = 1_000_000;

/**
 * Parse an editable quantity field into a whole number >= 1.
 * Quantity inputs are committed on blur/Enter (never per keystroke), so an
 * in-progress or invalid value falls back to the current committed quantity
 * instead of snapping to 1 — see the "quantity stuck at 1" restock UX fix.
 */
export function parseRestockQuantity(raw: string, fallback: number): number {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 0) return fallback;
  const n = Math.floor(Number(digits));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, RESTOCK_MAX_QUANTITY);
}

/**
 * Parse an editable unit-cost field into a non-negative number with 2
 * decimals. Empty, unparseable, negative, or malformed (e.g. multiple dots)
 * input falls back to the current committed cost. A single "." is allowed.
 */
export function parseUnitCost(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !/^[0-9]*\.?[0-9]*$/.test(trimmed)) return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}