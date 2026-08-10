export const EXPIRY_TRACKING_MODES = ["off", "optional", "mandatory"] as const;
export type ExpiryTrackingMode = (typeof EXPIRY_TRACKING_MODES)[number];

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  categoryId: string | null;
  brandId: string | null;
  /** The unit stock is counted in — "piece", "kg", "bag" — free text, not a fixed picklist. */
  unitLabel: string;
  /**
   * Optional second unit this product can be sold by, e.g. "carton". Stock
   * stays one pool in unitLabel terms: selling by the alt unit deducts
   * quantity * altUnitConversionFactor. See finding 1.1-D in
   * docs/RESEARCH-AND-PLAN.md ("10 trays of eggs... sales of individual eggs
   * and whole trays should automatically deduct from the same inventory").
   */
  altUnitLabel: string | null;
  /** How many unitLabel units one altUnitLabel unit represents, e.g. 24. */
  altUnitConversionFactor: number | null;
  /** Sell price for one altUnitLabel unit. */
  altUnitSellPrice: number | null;
  costPrice: number;
  sellPrice: number;
  expiryTracking: ExpiryTrackingMode;
  /** ISO date (YYYY-MM-DD), only meaningful when expiryTracking !== "off". */
  expiryDate: string | null;
  /** Per-product low-stock alert level; null falls back to the app-wide LOW_STOCK_THRESHOLD. */
  lowStockThreshold: number | null;
  version: number;
  updatedAt: string;
}
