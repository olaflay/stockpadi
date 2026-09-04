export type StartingStockValidationReason = "blank" | "invalid" | "branch";

export interface StartingStockValidationResult {
  ok: boolean;
  reason?: StartingStockValidationReason;
  error: string | null;
  quantity: number | null;
}

/**
 * The "Starting stock" field on Add Product is compulsory: it may never be
 * left blank, and no opening stock movement can be written without a
 * quantity and, in multi-branch stores, a chosen branch. Kept as a pure
 * helper (not inline validation) so the submit gate, the error styling, and
 * the opening stock movement can never disagree on when the field is valid.
 * Returns the parsed quantity alongside ok so the submit path reuses it
 * instead of re-parsing.
 */
export function validateStartingStock(
  input: string,
  branchId: string | null,
  branchCount: number
): StartingStockValidationResult {
  const raw = input.trim();
  if (raw === "") {
    return { ok: false, reason: "blank", error: "Enter how many units are in stock (at least 1).", quantity: null };
  }

  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return { ok: false, reason: "invalid", error: "Starting stock must be 1 unit or more.", quantity: null };
  }

  if (branchCount > 1 && !branchId) {
    return { ok: false, reason: "branch", error: "Choose which branch this stock is at.", quantity: null };
  }

  return { ok: true, error: null, quantity };
}