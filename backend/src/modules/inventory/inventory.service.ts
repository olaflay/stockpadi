import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { requireAssignedBranch, requireCapability } from "../authorization/capabilities.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";

function objectPayload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Payload is required");
  return input as Record<string, unknown>;
}

export async function upsertProduct(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireCapability(context, "MANAGE_PRODUCTS");
  const payload = objectPayload(input);
  if (typeof payload.id !== "string" || typeof payload.name !== "string" || !payload.name.trim()) throw new HttpError(400, "INVALID_BODY", "Product id and name are required");
  const { data, error } = await db.rpc("sync_apply_product", { payload, actor_id: actor.id });
  if (error) throw new HttpError(500, "PRODUCT_FAILED", error.message);
  return data;
}

export async function listProducts(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(supabaseAdmin(), actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireCapability(context, "VIEW_PRODUCTS");
  const query = db.from("products").select("id, business_id, sku, barcode, name, category_id, brand_id, unit_label, alt_unit_label, alt_unit_conversion_factor, alt_unit_sell_price, cost_price, sell_price, low_stock_threshold, expiry_tracking, expiry_date, archived, version, updated_at").eq("business_id", context.businessId).order("name");
  const { data, error } = await query;
  if (error) throw new HttpError(500, "PRODUCTS_LOAD_FAILED", error.message);
  return { products: data ?? [], businessId: context.businessId };
}

export async function listCategories(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(supabaseAdmin(), actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireCapability(context, "VIEW_PRODUCTS");
  const { data, error } = await db.from("categories").select("id, name").eq("business_id", context.businessId).order("name");
  if (error) throw new HttpError(500, "CATEGORIES_LOAD_FAILED", error.message);
  return { categories: data ?? [], businessId: context.businessId };
}

export async function listInventory(db: SupabaseClient, actor: User) {
  const context = await resolveAccountContext(supabaseAdmin(), actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireCapability(context, "VIEW_BRANCH_STOCK");
  const { data: products, error: productError } = await db.from("products").select("id").eq("business_id", context.businessId);
  if (productError) throw new HttpError(500, "INVENTORY_LOAD_FAILED", productError.message);
  const productIds = (products ?? []).map((product) => product.id as string);
  if (!productIds.length) return { stock: [], branchIds: context.branchIds };
  const { data, error } = await db.from("inventory_stock").select("product_id, branch_id, quantity").in("product_id", productIds);
  if (error) throw new HttpError(500, "INVENTORY_LOAD_FAILED", error.message);
  const stock = context.accountType === "WORKER" ? (data ?? []).filter((row) => context.branchIds.includes(row.branch_id as string)) : (data ?? []);
  return { stock, branchIds: context.branchIds };
}

export async function adjustStock(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const payload = objectPayload(input);
  if (typeof payload.id !== "string" || typeof payload.branchId !== "string" || typeof payload.productId !== "string" || typeof payload.quantityDelta !== "number") throw new HttpError(400, "INVALID_BODY", "Stock adjustment id, branch, product and quantity are required");
  requireCapability(context, "ADJUST_STOCK");
  requireAssignedBranch(context, payload.branchId);
  const { data, error } = await db.rpc("sync_apply_stock_adjustment", { payload, actor_id: actor.id });
  if (error) throw new HttpError(500, "STOCK_ADJUSTMENT_FAILED", error.message);
  return data;
}

export async function submitStockCount(db: SupabaseClient, actor: User, input: unknown) {
  const context = await resolveAccountContext(db, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  requireCapability(context, "SUBMIT_STOCK_COUNT");
  if (!input || typeof input !== "object") throw new HttpError(400, "INVALID_BODY", "Stock count payload is required");
  const payload = input as Record<string, unknown>;
  if (typeof payload.id !== "string" || typeof payload.clientId !== "string" || typeof payload.branchId !== "string" || typeof payload.productId !== "string" || typeof payload.countedQuantity !== "number") throw new HttpError(400, "INVALID_BODY", "Stock count id, client id, branch, product and counted quantity are required");
  requireAssignedBranch(context, payload.branchId);
  const { data, error } = await db.rpc("sync_apply_stock_count", { payload, actor_id: actor.id });
  if (error) throw new HttpError(500, "STOCK_COUNT_FAILED", error.message);
  return data;
}
