export const PAYMENT_METHODS = ["cash", "transfer", "pos_terminal", "credit"] as const;

/** Recorded as a tag only. The app never processes, stores, or transmits live payment data. */
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * A sale is paid by one or more methods, not exactly one — the most-endorsed
 * complaint found researching this product (docs/RESEARCH-AND-PLAN.md
 * finding 1.1-A) is that a customer paying part cash, part transfer for one
 * purchase has nowhere to go in most POS apps. `amount` values across a
 * sale's `payments` must sum to `Sale.total`.
 */
export interface SalePayment {
  method: PaymentMethod;
  amount: number;
}

export interface SaleItem {
  productId: string;
  /** Quantity in whichever unit was sold (unitLabel), not necessarily the product's base unit. */
  quantity: number;
  unitPrice: number;
  discount: number;
  /** The unit this line was sold by — product.unitLabel or product.altUnitLabel at time of sale. */
  unitLabel: string;
  /** How many of the product's base unit one sold unit represents; 1 when sold by the base unit. */
  conversionFactor: number;
  /**
   * Same value as the paired stock_movements row's clientId, generated once
   * on-device and carried through the sync payload so the server writes the
   * identical clientId. Without this, the server would mint its own id for
   * the derived movement, and the next sync-down would re-insert it on the
   * originating device as if it were a second, distinct sale. See
   * .agents/rules/offline-sync-and-ledger.md.
   */
  movementClientId: string;
}

export interface Sale {
  id: string;
  businessId?: string;
  clientId: string;
  branchId: string;
  customerId: string | null;
  items: SaleItem[];
  payments: SalePayment[];
  subtotal: number;
  discount: number;
  total: number;
  createdAtLocal: string;
  createdAt: string;
  createdByUserId: string;
  voidedAt: string | null;
}
