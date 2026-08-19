import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";

export async function receivePurchase(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Purchase payload is required");
  const payload = input as Record<string, unknown>;
  if (typeof payload.id !== "string" || typeof payload.clientId !== "string" || typeof payload.branchId !== "string" || !Array.isArray(payload.items) || payload.items.length === 0) throw new HttpError(400, "INVALID_BODY", "Purchase id, client id, branch and items are required");
  const { data, error } = await db.rpc("sync_apply_purchase_receipt", { payload, actor_id: actor.id });
  if (error) throw new HttpError(500, "PURCHASE_FAILED", error.message);
  return data;
}

export async function listPurchases(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const { data, error } = await db.from("purchases").select("id, client_id, branch_id, supplier_id, status, created_at, created_by_user_id").eq("business_id", context.businessId).order("created_at", { ascending: false }).limit(500);
  if (error) throw new HttpError(500, "PURCHASES_LOAD_FAILED", error.message);
  const purchases = context.accountType === "WORKER" ? (data ?? []).filter((purchase) => context.branchIds.includes(purchase.branch_id as string)) : (data ?? []);
  const ids = purchases.map((purchase) => purchase.id as string);
  if (!ids.length) return { purchases: [] };
  const { data: items, error: itemError } = await db.from("purchase_items").select("purchase_id, product_id, quantity, unit_cost").in("purchase_id", ids);
  if (itemError) throw new HttpError(500, "PURCHASES_LOAD_FAILED", itemError.message);
  return { purchases: purchases.map((purchase) => ({ ...purchase, items: (items ?? []).filter((item) => item.purchase_id === purchase.id) })) };
}
