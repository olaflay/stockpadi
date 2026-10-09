import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { RefundSaleRequest } from "./refund-sale.schema.js";
import { queueSyncHints } from "../sync/sync-hints.js";

export async function refundSale(db: SupabaseClient, actor: User, request: RefundSaleRequest) {
  const context = await resolveAccountContext(db, actor);

  // Refunding reverses stock and cash/credit, so it is strictly restricted
  // to business owners and authorized managers.
  if ((context.accountType !== "BUSINESS_OWNER" && context.accountType !== "ADMIN") || !context.businessId) {
    throw new HttpError(403, "FORBIDDEN", "Only an owner or admin may refund a sale");
  }

  const { data, error } = await db.rpc("refund_sale", {
    p_client_refund_id: request.clientRefundId,
    p_sale_id: request.saleId,
    p_actor_id: actor.id,
    p_business_id: context.businessId,
    p_items: request.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    p_payments: request.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
    })),
    p_reason: request.reason,
  });

  if (error) {
    if (error.message.includes("Sale not found")) {
      throw new HttpError(404, "NOT_FOUND", "Sale not found");
    }
    if (error.message.includes("voided")) {
      throw new HttpError(409, "ALREADY_VOIDED", "Cannot refund a voided sale");
    }
    if (error.message.includes("exceeds")) {
      throw new HttpError(400, "REFUND_EXCEEDED", error.message);
    }
    if (error.message.includes("already applied") || error.message.includes("idempotency")) {
      throw new HttpError(409, "REFUND_IDEMPOTENCY_CONFLICT", error.message);
    }
    if (error.message.includes("mandatory") || error.message.includes("positive")) {
      throw new HttpError(400, "INVALID_REFUND", error.message);
    }
    throw new HttpError(500, "REFUND_FAILED", error.message);
  }

  await queueSyncHints(context.businessId, [null]);

  return {
    status: "ok",
    refundId: data?.refundId,
    totalRefunded: data?.totalRefunded ?? 0,
    restoredStock: data?.restoredStock ?? 0,
    items: data?.items ?? [],
    payments: data?.payments ?? [],
  };
}
