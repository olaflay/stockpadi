import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logging/logger.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { hasCapability } from "../authorization/capabilities.js";

const PAGE_SIZE = 200;
const CURSOR_DATASETS = new Set([
  "business_profile", "customers", "credit_movements", "branches", "categories",
  "products", "suppliers", "inventory", "sales", "expenses", "purchases",
]);
type TimestampPosition = { time: string; id: string };
type InventoryPosition = { time: string; productId: string; branchId: string };
interface PullCursor {
  version: 2;
  lowerWatermark: string;
  upperWatermark: string;
  positions: Record<string, TimestampPosition | InventoryPosition | undefined>;
  deferred: string[];
}

export interface PullEntityResult { entity: string; success: boolean; records: unknown[]; lastSuccessfulPullAt: string | null; error: { code: string; message: string } | null; }
export interface SessionPullResult { ok: true; businessId: string; serverTime: string; cursor: string | null; nextCursor: string | null; hasMore: boolean; entities: PullEntityResult[]; }

function encodeCursor(value: PullCursor): string { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decodeCursor(value: string | undefined, serverTime: string): PullCursor {
  if (!value) return { version: 2, lowerWatermark: "1970-01-01T00:00:00.000Z", upperWatermark: serverTime, positions: {}, deferred: [] };
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { version?: number; watermark?: string; lowerWatermark?: string; upperWatermark?: string; positions?: PullCursor["positions"]; deferred?: unknown[]; complete?: boolean };
    if (decoded.version === 1 && typeof decoded.watermark === "string") {
      return { version: 2, lowerWatermark: decoded.watermark, upperWatermark: serverTime, positions: {}, deferred: [] };
    }
    if (decoded.version !== 2 || !isTimestamp(decoded.lowerWatermark) || !isTimestamp(decoded.upperWatermark) || !isRecord(decoded.positions)) throw new Error("invalid cursor");
    for (const [dataset, position] of Object.entries(decoded.positions)) {
      if (!CURSOR_DATASETS.has(dataset)) throw new Error("invalid cursor dataset");
      if (dataset === "inventory") {
        if (!isInventoryPosition(position)) throw new Error("invalid inventory cursor position");
      } else if (!isTimestampPosition(position)) {
        throw new Error("invalid cursor position");
      }
    }
    const deferred = Array.isArray(decoded.deferred)
      ? decoded.deferred.filter((entity): entity is string => typeof entity === "string" && CURSOR_DATASETS.has(entity))
      : [];
    if (decoded.complete) return { version: 2, lowerWatermark: deferred.length ? decoded.lowerWatermark : decoded.upperWatermark, upperWatermark: serverTime, positions: {}, deferred };
    return { ...decoded, deferred } as PullCursor;
  } catch { throw new HttpError(400, "INVALID_CURSOR", "The sync cursor is invalid. A complete refresh is required."); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isTimestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function isTimestampPosition(value: unknown): value is TimestampPosition {
  return isRecord(value) && isTimestamp(value.time) && typeof value.id === "string" && value.id.length > 0;
}
function isInventoryPosition(value: unknown): value is InventoryPosition {
  return isRecord(value) && isTimestamp(value.time) && typeof value.productId === "string" && value.productId.length > 0 && typeof value.branchId === "string" && value.branchId.length > 0;
}

function takePage<T>(cursor: PullCursor, key: string, records: T[], position: TimestampPosition | InventoryPosition | undefined): { records: T[]; hasMore: boolean } {
  const hasMore = records.length > PAGE_SIZE;
  const visible = records.slice(0, PAGE_SIZE);
  const last = visible[visible.length - 1] as Record<string, unknown> | undefined;
  if (last) {
    if (typeof last.product_id === "string" && typeof last.branch_id === "string" && typeof last.updated_at === "string") position = { time: last.updated_at, productId: last.product_id, branchId: last.branch_id };
    else if (typeof last.updated_at === "string") position = { time: last.updated_at, id: String(last.id) };
    else if (typeof last.created_at === "string") position = { time: last.created_at, id: String(last.id) };
  }
  if (position) cursor.positions[key] = position;
  return { records: visible, hasMore };
}

async function pullEntity(entities: PullEntityResult[], entity: string, loader: () => Promise<unknown[]>): Promise<boolean> {
  try { entities.push({ entity, success: true, records: await loader(), lastSuccessfulPullAt: new Date().toISOString(), error: null }); return true; }
  catch (cause) {
    const error = cause instanceof HttpError ? { code: safePullCode(cause.code), message: safePullMessage(cause.code, cause.message) } : { code: "PULL_FAILED", message: "Could not load this dataset." };
    logger.error("sync pull dataset failed", {
      entity,
      safeCode: error.code,
      sourceCode: cause instanceof HttpError ? cause.code : "UNHANDLED_PULL_ERROR",
      status: cause instanceof HttpError ? cause.status : 500,
    }, cause);
    entities.push({ entity, success: false, records: [], lastSuccessfulPullAt: null, error }); return false;
  }
}

/** Incremental keyset pull with an opaque watermark and per-dataset positions. */
export async function pullSession(db: SupabaseClient, actor: User, requestedCursor?: string, contextDb: SupabaseClient = db): Promise<SessionPullResult> {
  const context = await resolveAccountContext(contextDb, actor);
  if (!context.businessId) throw new HttpError(403, "FORBIDDEN", "A business account is required");
  const serverTime = new Date().toISOString();
  const cursor = decodeCursor(requestedCursor, serverTime);
  const entities: PullEntityResult[] = [];
  const more: boolean[] = [];
  const deferred = new Set(cursor.deferred);
  const skip = (entity: string): unknown[] => {
    deferred.add(entity);
    more.push(false);
    return [];
  };
  const allow = (entity: string): void => {
    deferred.delete(entity);
  };

  await pullEntity(entities, "business_profile", async () => {
    allow("business_profile");
    let query = db.from("business_profile").select("id, name, business_type, currency, owing_message_template, updated_at").eq("id", context.businessId).lte("updated_at", cursor.upperWatermark).order("updated_at").order("id").limit(PAGE_SIZE + 1);
    const position = cursor.positions.business_profile;
    if (isTimestampPosition(position)) query = query.or(`updated_at.gt.${position.time},and(updated_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("updated_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "PROFILE_LOAD_FAILED", error.message);
    const page = takePage(cursor, "business_profile", data ?? [], position); more.push(page.hasMore); return page.records;
  });

  await pullEntity(entities, "customers", async () => {
    if (!hasCapability(context, "VIEW_CUSTOMERS")) return skip("customers");
    allow("customers");
    let query = db.from("customers").select("id, name, phone, updated_at").eq("business_id", context.businessId).lte("updated_at", cursor.upperWatermark).order("updated_at").order("id").limit(PAGE_SIZE + 1);
    const position = cursor.positions.customers;
    if (isTimestampPosition(position)) query = query.or(`updated_at.gt.${position.time},and(updated_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("updated_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "CUSTOMERS_LOAD_FAILED", error.message);
    const page = takePage(cursor, "customers", data ?? [], position);
    const ids = page.records.map((row) => (row as { id: string }).id);
    const { data: balances, error: balanceError } = ids.length ? await db.from("customer_credit_balances").select("customer_id, balance").in("customer_id", ids) : { data: [], error: null };
    if (balanceError) throw new HttpError(500, "CREDIT_BALANCES_LOAD_FAILED", balanceError.message);
    const balanceById = new Map((balances ?? []).map((row) => [row.customer_id as string, Number(row.balance ?? 0)]));
    more.push(page.hasMore); return page.records.map((row) => ({ ...row, balance: balanceById.get((row as { id: string }).id) ?? 0 }));
  });

  await pullEntity(entities, "credit_movements", async () => {
    if (!hasCapability(context, "VIEW_CUSTOMERS")) return skip("credit_movements");
    allow("credit_movements");
    let query = db.from("customer_credit_movements").select("id, client_id, customer_id, amount_delta, source_reference_id, created_at_local, created_at, created_by_user_id").eq("business_id", context.businessId).lte("created_at", cursor.upperWatermark).order("created_at").order("id").limit(PAGE_SIZE + 1);
    const position = cursor.positions.credit_movements;
    if (isTimestampPosition(position)) query = query.or(`created_at.gt.${position.time},and(created_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("created_at", cursor.lowerWatermark);
    const { data, error } = await query;
    if (error) throw new HttpError(500, "CREDIT_MOVEMENTS_LOAD_FAILED", error.message);
    const result = takePage(cursor, "credit_movements", data ?? [], position);
    more.push(result.hasMore);
    return result.records;
  });

  await pullEntity(entities, "branches", async () => {
    allow("branches");
    let query = db.from("branches").select("id, name, is_active, is_primary, business_id, updated_at").eq("business_id", context.businessId).lte("updated_at", cursor.upperWatermark).order("updated_at").order("id").limit(PAGE_SIZE + 1);
    if (context.accountType === "WORKER") query = query.in("id", context.branchIds);
    const position = cursor.positions.branches;
    if (isTimestampPosition(position)) query = query.or(`updated_at.gt.${position.time},and(updated_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("updated_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "BRANCHES_LOAD_FAILED", error.message);
    const page = takePage(cursor, "branches", data ?? [], position); more.push(page.hasMore); return page.records;
  });

  await pullEntity(entities, "categories", async () => {
    if (!hasCapability(context, "VIEW_PRODUCTS")) return skip("categories");
    allow("categories");
    let query = db.from("categories").select("id, name, created_at").eq("business_id", context.businessId).lte("created_at", cursor.upperWatermark).order("created_at").order("id").limit(PAGE_SIZE + 1);
    const position = cursor.positions.categories;
    if (isTimestampPosition(position)) query = query.or(`created_at.gt.${position.time},and(created_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("created_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "CATEGORIES_LOAD_FAILED", error.message);
    const page = takePage(cursor, "categories", data ?? [], position); more.push(page.hasMore); return page.records;
  });

  await pullEntity(entities, "products", async () => {
    if (!hasCapability(context, "VIEW_PRODUCTS")) return skip("products");
    allow("products");
    let query = db.from("products").select("id, business_id, sku, barcode, name, category_id, brand_id, unit_label, alt_unit_label, alt_unit_conversion_factor, alt_unit_sell_price, cost_price, sell_price, low_stock_threshold, expiry_tracking, expiry_date, archived, version, updated_at").eq("business_id", context.businessId).lte("updated_at", cursor.upperWatermark).order("updated_at").order("id").limit(PAGE_SIZE + 1);
    const position = cursor.positions.products;
    if (isTimestampPosition(position)) query = query.or(`updated_at.gt.${position.time},and(updated_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("updated_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "PRODUCTS_LOAD_FAILED", error.message);
    const page = takePage(cursor, "products", data ?? [], position); more.push(page.hasMore); return page.records;
  });

  await pullEntity(entities, "suppliers", async () => {
    if (!hasCapability(context, "RECEIVE_STOCK")) return skip("suppliers");
    allow("suppliers");
    let query = db.from("suppliers").select("id, business_id, name, phone, updated_at").eq("business_id", context.businessId).lte("updated_at", cursor.upperWatermark).order("updated_at").order("id").limit(PAGE_SIZE + 1);
    const position = cursor.positions.suppliers;
    if (isTimestampPosition(position)) query = query.or(`updated_at.gt.${position.time},and(updated_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("updated_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "SUPPLIERS_LOAD_FAILED", error.message);
    const page = takePage(cursor, "suppliers", data ?? [], position); more.push(page.hasMore); return page.records;
  });

  await pullEntity(entities, "inventory", async () => {
    if (!hasCapability(context, "VIEW_BRANCH_STOCK")) return skip("inventory");
    allow("inventory");
    // inventory_stock is a view over a rollup keyed only by product/branch;
    // this request uses the service-role client, so RLS cannot provide the
    // tenant filter for us. Resolve the tenant's product IDs first.
    const { data: tenantProducts, error: tenantProductsError } = await db
      .from("products")
      .select("id")
      .eq("business_id", context.businessId);
    if (tenantProductsError) throw new HttpError(500, "INVENTORY_LOAD_FAILED", tenantProductsError.message);
    const productIds = (tenantProducts ?? []).map((product) => product.id as string);
    if (productIds.length === 0) return [];
    let query = db.from("inventory_stock").select("product_id, branch_id, quantity, updated_at").lte("updated_at", cursor.upperWatermark).order("updated_at").order("product_id").order("branch_id").limit(PAGE_SIZE + 1);
    query = query.in("product_id", productIds);
    if (context.accountType === "WORKER") query = query.in("branch_id", context.branchIds);
    const position = cursor.positions.inventory;
    if (isInventoryPosition(position)) query = query.or(`updated_at.gt.${position.time},and(updated_at.eq.${position.time},product_id.gt.${position.productId}),and(updated_at.eq.${position.time},product_id.eq.${position.productId},branch_id.gt.${position.branchId})`); else query = query.gt("updated_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "INVENTORY_LOAD_FAILED", error.message);
    const page = takePage(cursor, "inventory", data ?? [], position); more.push(page.hasMore); return page.records;
  });

  await pullEntity(entities, "sales", async () => {
    if (context.accountType === "WORKER" && (!hasCapability(context, "VIEW_OWN_SALES") || !hasCapability(context, "VIEW_RECEIPTS"))) return skip("sales");
    allow("sales");
    let query = db.from("sales").select("id, client_id, branch_id, customer_id, subtotal, discount, total, created_at_local, created_at, created_by_user_id, voided_at").eq("business_id", context.businessId).lte("created_at", cursor.upperWatermark).order("created_at").order("id").limit(PAGE_SIZE + 1);
    if (context.accountType === "WORKER") query = query.eq("created_by_user_id", actor.id).in("branch_id", context.branchIds);
    const position = cursor.positions.sales;
    if (isTimestampPosition(position)) query = query.or(`created_at.gt.${position.time},and(created_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("created_at", cursor.lowerWatermark);
    const { data, error } = await query; if (error) throw new HttpError(500, "SALES_LOAD_FAILED", error.message);
    const page = takePage(cursor, "sales", data ?? [], position);
    const ids = page.records.map((row) => (row as { id: string }).id);
    const [{ data: items, error: itemError }, { data: payments, error: paymentError }] = ids.length ? await Promise.all([
      db.from("sale_items").select("sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor").in("sale_id", ids),
      db.from("sale_payments").select("sale_id, method, amount, tendered_amount, note").in("sale_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (itemError || paymentError) throw new HttpError(500, "SALES_LOAD_FAILED", itemError?.message ?? paymentError?.message ?? "Could not load sale details");
    more.push(page.hasMore); return page.records.map((sale) => ({ ...sale, items: (items ?? []).filter((item) => item.sale_id === (sale as { id: string }).id), payments: (payments ?? []).filter((payment) => payment.sale_id === (sale as { id: string }).id) }));
  });

  for (const [entity, table, select] of [["expenses", "expenses", "id, branch_id, category, amount, note, created_at, created_by_user_id"], ["purchases", "purchases", "id, client_id, branch_id, supplier_id, status, created_at, created_by_user_id"]] as const) {
    await pullEntity(entities, entity, async () => {
      if (entity === "expenses" && !hasCapability(context, "MANAGE_EXPENSES")) return skip("expenses");
      if (entity === "purchases" && !hasCapability(context, "RECEIVE_STOCK")) return skip("purchases");
      allow(entity);
      let query = db.from(table).select(select).eq("business_id", context.businessId).lte("created_at", cursor.upperWatermark).order("created_at").order("id").limit(PAGE_SIZE + 1);
      const position = cursor.positions[entity];
      if (isTimestampPosition(position)) query = query.or(`created_at.gt.${position.time},and(created_at.eq.${position.time},id.gt.${position.id})`); else query = query.gt("created_at", cursor.lowerWatermark);
      const { data, error } = await query; if (error) throw new HttpError(500, `${entity.toUpperCase()}_LOAD_FAILED`, error.message);
      const page = takePage(cursor, entity, data ?? [], position);
      if (entity === "purchases") {
        const ids = page.records.map((row) => (row as { id: string }).id);
        const { data: items, error: itemError } = ids.length ? await db.from("purchase_items").select("purchase_id, product_id, quantity, unit_cost").in("purchase_id", ids) : { data: [], error: null };
        if (itemError) throw new HttpError(500, "PURCHASES_LOAD_FAILED", itemError.message);
        more.push(page.hasMore); return page.records.map((purchase) => ({ ...purchase, items: (items ?? []).filter((item) => item.purchase_id === (purchase as { id: string }).id) }));
      }
      more.push(page.hasMore); return page.records;
  });
  }

  const hasMore = more.some(Boolean);
  cursor.deferred = [...deferred];
  const nextCursor = encodeCursor(cursor);
  const deferredEntities = [...deferred];
  const completedCursor = encodeCursor({
    version: 2,
    lowerWatermark: deferredEntities.length ? cursor.lowerWatermark : cursor.upperWatermark,
    upperWatermark: cursor.upperWatermark,
    positions: {},
    deferred: deferredEntities,
    complete: true,
  } as PullCursor & { complete: true });
  return { ok: true, businessId: context.businessId, serverTime: cursor.upperWatermark, cursor: hasMore ? null : completedCursor, nextCursor: hasMore ? nextCursor : null, hasMore, entities };
}

function safePullCode(code: string): string { return code === "FORBIDDEN" || code === "ACCOUNT_NOT_APPROVED" || code === "BUSINESS_UNAVAILABLE" ? code : "PULL_FAILED"; }
function safePullMessage(code: string, message: string): string { return code === "FORBIDDEN" || code === "ACCOUNT_NOT_APPROVED" || code === "BUSINESS_UNAVAILABLE" ? message : "Could not refresh this dataset."; }
