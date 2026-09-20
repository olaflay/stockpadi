import { serverGet } from "@/features/operations/server-client";
import type { Sale } from "@/types/sale";

export async function fetchServerSales(): Promise<Sale[]> {
  const result = await serverGet<{ sales?: Record<string, unknown>[] }>("/api/sales");
  return (result.sales ?? []).map((sale: Record<string, unknown>) => ({
    id: sale.id, clientId: sale.client_id, branchId: sale.branch_id, customerId: sale.customer_id ?? null,
    subtotal: Number(sale.subtotal), discount: Number(sale.discount), total: Number(sale.total),
    createdAtLocal: sale.created_at_local, createdAt: sale.created_at, createdByUserId: sale.created_by_user_id, voidedAt: sale.voided_at ?? null,
    items: (sale.items as Record<string, unknown>[] ?? []).map((item) => ({ productId: item.product_id, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), discount: Number(item.discount), unitLabel: item.unit_label, conversionFactor: Number(item.unit_conversion_factor), movementClientId: "server" })),
    payments: (sale.payments as Record<string, unknown>[] ?? []).map((payment) => ({ method: payment.method, amount: Number(payment.amount) })),
  })) as Sale[];
}
