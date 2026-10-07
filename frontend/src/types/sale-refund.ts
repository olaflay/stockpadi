import type { PaymentMethod } from "@/types/sale";

export interface SaleRefundItem {
  productId: string;
  quantity: number;
  /** Authoritative original sale-line price, returned by the server. */
  unitPrice: number;
  total: number;
  conversionFactor?: number;
}

export interface SaleRefundPayment {
  method: PaymentMethod;
  amount: number;
}

/** Append-only, server-acknowledged refund mirror. */
export interface SaleRefund {
  id: string;
  businessId?: string;
  clientRefundId: string;
  branchId: string;
  saleId: string;
  totalRefunded: number;
  reason: string;
  items: SaleRefundItem[];
  payments: SaleRefundPayment[];
  createdAt: string;
  createdAtLocal: string;
}
