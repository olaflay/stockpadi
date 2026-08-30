/**
 * Parses an optional leading integer quantity prefix from a POS search query.
 *
 * Examples:
 *   "5 sugar"   -> { qty: 5,  term: "sugar" }
 *   "indomie"   -> { qty: 1,  term: "indomie" }
 *   "3"         -> { qty: 1,  term: "3" }    -- lone digit, no following text
 *   "0 flour"   -> { qty: 1,  term: "flour" } -- qty < 1 is ignored
 *   "1000 rice" -> { qty: 1,  term: "rice" }  -- cap at 999 to prevent accidents
 *
 * The qty prefix ONLY activates via Enter or barcode scan-to-add.
 * Individual row taps always add x1 (the cashier can adjust with steppers).
 */
export function parsePosQuery(q: string): { qty: number; term: string } {
  const m = q.trimStart().match(/^(\d+)\s+(.+)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 999) return { qty: n, term: m[2] };
    return { qty: 1, term: m[2] };
  }
  return { qty: 1, term: q };
}
