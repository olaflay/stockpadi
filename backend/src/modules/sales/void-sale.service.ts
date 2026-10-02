import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import type { VoidSaleRequest } from "./void-sale.schema.js";

export async function voidSale(db: SupabaseClient, actor: User, request: VoidSaleRequest) {
  const context = await resolveAccountContext(db, actor);
  // Voiding reverses stock and credit movements, so it is treated as a
  // tenant-owner financial action.
  //
  // `accountType === "ADMIN"` can only be a PLATFORM admin: the
  // business_memberships_account_type_check constraint admits only
  // ('BUSINESS_OWNER', 'WORKER'), and the column comment states that "ADMIN is
  // represented only by platform_admins". A platform admin has no businessId, so
  // the `!context.businessId` conjunct rejects them regardless, and the ADMIN
  // comparison below is unreachable. A platform operator must not be able to
  // write to a tenant's financial ledger.
  //
  // The ADMIN comparison is left in place rather than deleted, because removing
  // it would silently discard a product question this comment used to answer
  // wrongly: whether a TENANT manager (users.role = 'admin', a different field
  // from the authoritative account_type) should be able to void. See
  // questions.md before changing this gate.
  if ((context.accountType !== "BUSINESS_OWNER" && context.accountType !== "ADMIN") || !context.businessId)
    throw new HttpError(403, "FORBIDDEN", "Only an owner or admin may void a sale");
  const { data, error } = await db.rpc("void_sale", { p_sale_id: request.saleId, p_actor_id: actor.id, p_business_id: context.businessId, p_reason: request.reason });
  if (error) {
    if (error.message.includes("Sale not found")) throw new HttpError(404, "NOT_FOUND", "Sale not found");
    if (error.message.includes("already voided")) throw new HttpError(409, "ALREADY_VOIDED", "This sale was already voided");
    throw new HttpError(500, "VOID_FAILED", error.message);
  }
  return {
    status: "ok",
    reversedMovements: data?.reversedMovements ?? 0,
    reversedCreditMovements: data?.reversedCreditMovements ?? 0,
    reversedPayments: data?.reversedPayments ?? 0,
  };
}
