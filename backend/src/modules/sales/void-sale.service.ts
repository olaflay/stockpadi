import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { VoidSaleRequest } from "./void-sale.schema.js";

export async function voidSale(db: SupabaseClient, actor: User, request: VoidSaleRequest) {
  const context = await resolveAccountContext(db, actor);
  if (context.accountType !== "BUSINESS_OWNER" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Only a business owner may void a sale");
  const { data, error } = await db.rpc("void_sale", { p_sale_id: request.saleId, p_actor_id: actor.id, p_business_id: context.businessId, p_reason: request.reason });
  if (error) {
    if (error.message.includes("Sale not found")) throw new HttpError(404, "NOT_FOUND", "Sale not found");
    if (error.message.includes("already voided")) throw new HttpError(409, "ALREADY_VOIDED", "This sale was already voided");
    throw new HttpError(500, "VOID_FAILED", error.message);
  }
  return { status: "ok", reversedMovements: data?.reversedMovements ?? 0, reversedCreditMovements: data?.reversedCreditMovements ?? 0 };
}
