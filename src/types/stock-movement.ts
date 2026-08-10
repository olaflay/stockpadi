/**
 * The append-only ledger entry. Current stock is always SUM(quantity_delta)
 * for a product/branch, never a stored mutable field.
 * See .agents/rules/offline-sync-and-ledger.md before changing this shape.
 */

export const STOCK_MOVEMENT_SOURCES = [
  "sale",
  "sale_void",
  "purchase_receipt",
  "adjustment",
  "initial_stock",
] as const;

export type StockMovementSource = (typeof STOCK_MOVEMENT_SOURCES)[number];

/**
 * A reason *code*, never free text alone, per
 * .agents/skills/add-stock-movement-type.md Step 2 ("reasons need to be
 * reportable later"). `note` on the adjustment itself carries any free-text
 * detail on top of this.
 */
export const ADJUSTMENT_REASON_CODES = ["recount", "damage", "theft", "expiry", "other"] as const;

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASON_CODES)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReasonCode, string> = {
  recount: "Recount",
  damage: "Damaged",
  theft: "Theft / loss",
  expiry: "Expired",
  other: "Other",
};

export interface StockMovement {
  id: string;
  clientId: string;
  branchId: string;
  productId: string;
  quantityDelta: number;
  source: StockMovementSource;
  sourceReferenceId: string | null;
  reasonCode: string | null;
  createdAtLocal: string;
  createdAt: string;
  createdByUserId: string;
}
