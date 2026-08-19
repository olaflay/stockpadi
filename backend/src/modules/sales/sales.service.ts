import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";

export async function listSales(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  let query = db.from("sales").select("id, client_id, branch_id, customer_id, subtotal, discount, total, created_at_local, created_at, created_by_user_id, voided_at").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(200);
  if (context.accountType === "WORKER") query = query.eq("created_by_user_id", actor.id).in("branch_id", context.branchIds);
  const { data: sales, error } = await query;
  if (error) throw new HttpError(500, "SALES_LOAD_FAILED", error.message);
  const ids = (sales ?? []).map((sale) => sale.id as string);
  if (!ids.length) return { sales: [] };
  const [{ data: items, error: itemError }, { data: payments, error: paymentError }] = await Promise.all([
    db.from("sale_items").select("sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor").in("sale_id", ids),
    db.from("sale_payments").select("sale_id, method, amount").in("sale_id", ids),
  ]);
  if (itemError || paymentError) throw new HttpError(500, "SALES_LOAD_FAILED", itemError?.message ?? paymentError?.message ?? "Could not load sale details");
  return { sales: (sales ?? []).map((sale) => ({ ...sale, items: (items ?? []).filter((item) => item.sale_id === sale.id), payments: (payments ?? []).filter((payment) => payment.sale_id === sale.id) })) };
}
