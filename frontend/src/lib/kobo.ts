/**
 * Currency integer precision helpers (Kobo <-> Naira).
 *
 * PostgreSQL stores monetary amounts in `numeric(14, 2)`, which is an exact arbitrary-precision
 * decimal type (no IEEE-754 float drift).
 *
 * In JavaScript, numbers are double-precision binary floats (0.1 + 0.2 = 0.30000000000000004).
 * Performing client-side arithmetic in integer Kobo (1 Naira = 100 Kobo) eliminates any
 * possibility of rounding drift or fractional point bugs when users enter prices.
 */

/**
 * Converts a Naira decimal amount into an integer number of Kobo.
 * e.g. 1500.50 -> 150050, 1500 -> 150000
 */
export function toKobo(naira: number | string): number {
  const parsed = typeof naira === "string" ? parseFloat(naira) : naira;
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

/**
 * Converts an integer number of Kobo back into a standard decimal Naira amount.
 * e.g. 150050 -> 1500.5, 150000 -> 1500
 */
export function fromKobo(kobo: number): number {
  if (isNaN(kobo)) return 0;
  return kobo / 100;
}

/**
 * Sums an array of Naira amounts using integer Kobo arithmetic to prevent float errors.
 */
export function sumNairaAmounts(amounts: number[]): number {
  const totalKobo = amounts.reduce((acc, val) => acc + toKobo(val), 0);
  return fromKobo(totalKobo);
}

/**
 * Multiplies a unit price in Naira by a quantity using integer Kobo arithmetic.
 */
export function multiplyNaira(unitPrice: number, quantity: number): number {
  const unitKobo = toKobo(unitPrice);
  const totalKobo = Math.round(unitKobo * quantity);
  return fromKobo(totalKobo);
}
