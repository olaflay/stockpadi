import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { hasCapability, requireCapability } from "../authorization/capabilities.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";

export async function listSales(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(supabaseAdmin(), actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  if (context.accountType === "WORKER") {
    requireCapability(context, "VIEW_RECEIPTS");
    if (!hasSalesListCapability(context)) {
      throw new HttpError(403, "FORBIDDEN", "This account cannot view branch sales");
    }
  }
  let query = db.from("sales").select("id, client_id, branch_id, customer_id, subtotal, discount, total, created_at_local, created_at, created_by_user_id, voided_at").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(200);
  if (context.accountType === "WORKER") {
    query = query.in("branch_id", context.branchIds);
    if (!hasCapability(context, "VIEW_BRANCH_SALES")) query = query.eq("created_by_user_id", actor.id);
  }
  const { data: sales, error } = await query;
  if (error) throw new HttpError(500, "SALES_LOAD_FAILED", error.message);
  const ids = (sales ?? []).map((sale) => sale.id as string);
  if (!ids.length) return { sales: [] };
  const creatorIds = [...new Set((sales ?? []).map((sale) => String(sale.created_by_user_id ?? "")).filter(Boolean))];
  const creatorNames = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: creators } = await supabaseAdmin()
      .from("users")
      .select("id, full_name")
      .eq("business_id", context.businessId)
      .in("id", creatorIds);
    for (const creator of creators ?? []) {
      if (typeof creator.id === "string" && typeof creator.full_name === "string" && creator.full_name.trim()) {
        creatorNames.set(creator.id, creator.full_name.trim());
      }
    }
  }
  const loadSaleItems = () => context.accountType === "WORKER"
    ? db.from("sale_items").select("sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor").in("sale_id", ids)
    : supabaseAdmin().from("sale_items").select("sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor, unit_cost, cost_basis, product_version, cost_flags").in("sale_id", ids);
  const [{ data: items, error: itemError }, { data: payments, error: paymentError }] = await Promise.all([
    loadSaleItems(),
    db.from("sale_payments").select("sale_id, method, amount").in("sale_id", ids),
  ]);
  if (itemError || paymentError) throw new HttpError(500, "SALES_LOAD_FAILED", itemError?.message ?? paymentError?.message ?? "Could not load sale details");
  return { sales: (sales ?? []).map((sale) => ({
    ...sale,
    created_by_user_name: creatorNames.get(String(sale.created_by_user_id)) ?? null,
    items: (items ?? []).filter((item) => item.sale_id === sale.id),
    payments: (payments ?? []).filter((payment) => payment.sale_id === sale.id),
  })) };
}

function hasSalesListCapability(context: Parameters<typeof hasCapability>[0]): boolean {
  return hasCapability(context, "VIEW_OWN_SALES") || hasCapability(context, "VIEW_BRANCH_SALES");
}
