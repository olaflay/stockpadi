import type { Sale } from "@/types/sale";

export interface ReceiptViewModel {
  businessName: string;
  receiptNumber: string;
  dateLabel: string;
  cashierName: string | null;
  customerName: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitLabel: string;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  total: number;
  payments: Sale["payments"];
  voidedAt: string | null;
  /** True only for legacy lines created before sale-time labels were stored. */
  usesCurrentCatalogLabels: boolean;
}

/**
 * Builds a receipt solely from sale-time values. In particular, this never
 * consults today's product name, price, cost, or customer balance. Older
 * lines without a recorded label remain explicitly unavailable rather than
 * being reconstructed from mutable catalog data.
 */
export function createReceiptViewModel(params: {
  sale: Sale;
  businessName: string;
  customerName?: string | null;
  cashierName?: string | null;
  legacyProductNames?: ReadonlyMap<string, string>;
}): ReceiptViewModel {
  const { sale } = params;
  return {
    businessName: params.businessName,
    receiptNumber: sale.id.slice(0, 8).toUpperCase(),
    dateLabel: new Date(sale.createdAtLocal).toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    cashierName: params.cashierName ?? sale.createdByName ?? null,
    customerName: params.customerName ?? null,
    items: sale.items.map((item) => ({
      // Legacy sales have no original label. Showing the current catalog name
      // is more useful than an opaque ID, but the UI/export explicitly marks
      // that distinction below rather than presenting it as historic truth.
      name: item.productNameSnapshot ?? params.legacyProductNames?.get(item.productId) ?? "Product",
      quantity: item.quantity,
      unitLabel: item.unitLabel,
      unitPrice: item.unitPrice,
      discount: item.discount,
      total: item.quantity * item.unitPrice - item.discount,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: sale.payments,
    voidedAt: sale.voidedAt,
    usesCurrentCatalogLabels: sale.items.some((item) => !item.productNameSnapshot && Boolean(params.legacyProductNames?.get(item.productId))),
  };
}

