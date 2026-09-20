import { BackendRequestError, NetworkUnavailableError, serverGet } from "@/features/operations/server-client";
import { db, SESSION_SINGLETON_ID, type LocalBranch, type LocalCategory, type LocalCustomer, type SyncDiagnostic, type LocalInventoryStock } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Sale } from "@/types/sale";

let lastPreloadAt = 0;
let lastPreloadResult: SessionPreloadResult | null = null;
// The active-app fallback is intentionally bounded below the SyncEngine's
// 30-second scheduler. It is a check-for-changes request, not a full database
// download: the server cursor only returns rows newer than the last completed
// watermark.
const PRELOAD_THROTTLE_MS = 20 * 1000;
const PROTECTED_OUTBOX_STATUSES = ["pending", "syncing", "blocked", "conflict"];

export type SyncPullTrigger =
  | "boot"
  | "poll"
  | "online"
  | "visibility"
  | "focus"
  | "auth"
  | "push-success"
  | "manual";

export interface PullEndpointResult {
  endpoint: string;
  entity: string;
  success: boolean;
  lastSuccessfulPullAt: string | null;
  error: { code: string; message: string } | null;
  recordsApplied: number;
}

export interface SessionPreloadResult {
  startedAt: string;
  completedAt: string;
  fullySynced: boolean;
  pulls: PullEndpointResult[];
}

interface SessionPullResponse {
  ok?: boolean;
  businessId: string;
  serverTime: string;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
  entities: Array<{
    entity: string;
    success: boolean;
    records: unknown[];
    lastSuccessfulPullAt: string | null;
    error: { code: string; message: string } | null;
  }>;
}

interface ServerSupplier { id: string; business_id: string; name: string; phone: string | null; updated_at: string; }

interface ServerCustomerItem {
  id: string;
  name: string;
  phone: string | null;
  updated_at: string;
  balance: number;
}

export function getLastPreloadResult(): SessionPreloadResult | null {
  return lastPreloadResult;
}

/** Pull cloud state through the single Node session-pull contract. */
export async function preloadSessionData(force = false, trigger: SyncPullTrigger = force ? "manual" : "poll"): Promise<SessionPreloadResult> {
  const startedAt = new Date().toISOString();
  const empty = (fullySynced: boolean): SessionPreloadResult => ({ startedAt, completedAt: new Date().toISOString(), fullySynced, pulls: [] });
  if (typeof window === "undefined" || (typeof navigator !== "undefined" && !navigator.onLine)) {
    const result = empty(false);
    lastPreloadResult = result;
    return result;
  }
  if (!force && Date.now() - lastPreloadAt < PRELOAD_THROTTLE_MS && lastPreloadResult) return lastPreloadResult;
  lastPreloadAt = Date.now();

  const businessId = await getLocalBusinessId();
  if (!businessId) {
    const result = empty(false);
    lastPreloadResult = result;
    return result;
  }

  // A newly registered owner cannot pull business data until the platform
  // approves the business. Do not turn that expected state into a durable
  // failed-pull diagnostic (which would incorrectly show "Refresh needed").
  const session = await db.session.get(SESSION_SINGLETON_ID);
  const localUser = session ? await db.localUsers.get(session.userId) : undefined;
  if (
    localUser?.accountType === "BUSINESS_OWNER" &&
    localUser.businessStatus &&
    !["verified", "active"].includes(localUser.businessStatus)
  ) {
    const result = empty(false);
    lastPreloadResult = result;
    return result;
  }

  const pulls: PullEndpointResult[] = [];
  const pullStateId = `${businessId}:session`;
  const priorState = await db.syncPullState.get(pullStateId);
  let cursor = priorState?.cursor ?? null;
  let pagesFetched = 0;
  const entityCounts: Record<string, number> = {};
  const partialErrors: string[] = [];
  const pullStartedAt = new Date().toISOString();
  const isInvalidationTrigger = ["online", "visibility", "focus", "auth", "push-success"].includes(trigger);
  await db.syncPullState.put({
    id: pullStateId,
    businessId,
    cursor,
    startedAt: pullStartedAt,
    completedAt: priorState?.completedAt ?? null,
    pagesFetched: priorState?.pagesFetched ?? 0,
    entityCounts: priorState?.entityCounts ?? {},
    partialErrors: [],
    lastCompletePullAt: priorState?.lastCompletePullAt ?? null,
    lastPullTrigger: trigger,
    lastInvalidationReceivedAt: isInvalidationTrigger ? pullStartedAt : priorState?.lastInvalidationReceivedAt ?? null,
    lastServerContactAt: priorState?.lastServerContactAt ?? null,
    lastSuccessfulPushAt: priorState?.lastSuccessfulPushAt ?? null,
  });
  try {
    let response: SessionPullResponse;
    do {
      response = await serverGet<SessionPullResponse>(`/api/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      await db.syncPullState.update(pullStateId, { lastServerContactAt: new Date().toISOString() });
      pagesFetched += 1;
      if (response.ok === false || (response.businessId !== undefined && response.businessId !== businessId)) throw new Error("The server returned an invalid sync context.");
      const pagePulls: PullEndpointResult[] = [];
      for (const entity of response.entities ?? []) {
        let recordsApplied = 0;
        let error = entity.error;
        if (entity.success) {
          try {
            recordsApplied = await applyEntity(entity.entity, entity.records ?? [], businessId);
          } catch (cause) {
            error = safePullError(cause);
          }
        }
        const result: PullEndpointResult = {
          endpoint: "/api/sync/pull",
          entity: entity.entity,
          success: entity.success && !error,
          lastSuccessfulPullAt: entity.success && !error ? entity.lastSuccessfulPullAt ?? new Date().toISOString() : await previousSuccessfulPullAt(businessId, entity.entity),
          error: entity.success && !error ? null : error ?? { code: "PULL_FAILED", message: "Could not refresh this data." },
          recordsApplied,
        };
        pulls.push(result);
        pagePulls.push(result);
        entityCounts[entity.entity] = (entityCounts[entity.entity] ?? 0) + recordsApplied;
        await storeDiagnostic(businessId, result);
      }
      const failed = pagePulls.filter((pull) => !pull.success);
      if (failed.length) {
        partialErrors.push(...failed.map((pull) => `${pull.entity}:${pull.error?.code ?? "PULL_FAILED"}`));
        break;
      }
      cursor = response.nextCursor ?? response.cursor;
      await db.syncPullState.update(pullStateId, { cursor, pagesFetched, entityCounts, partialErrors });
    } while (response.hasMore);
    if (partialErrors.length) throw new Error("One or more datasets could not be refreshed.");
    await db.syncPullState.update(pullStateId, {
      cursor,
      completedAt: new Date().toISOString(),
      pagesFetched,
      entityCounts,
      partialErrors,
      lastCompletePullAt: response.serverTime ?? new Date().toISOString(),
    });
    await storeDiagnostic(businessId, {
      endpoint: "/api/sync/pull",
      entity: "session",
      success: true,
      lastSuccessfulPullAt: response.serverTime ?? new Date().toISOString(),
      error: null,
      recordsApplied: Object.values(entityCounts).reduce((total, count) => total + count, 0),
    });
  } catch (cause) {
    const result: PullEndpointResult = {
      endpoint: "/api/sync/pull",
      entity: "session",
      success: false,
      lastSuccessfulPullAt: await previousSuccessfulPullAt(businessId, "session"),
      error: safePullError(cause),
      recordsApplied: 0,
    };
    pulls.push(result);
    await storeDiagnostic(businessId, result);
    await db.syncPullState.update(pullStateId, { startedAt: pullStartedAt, pagesFetched, entityCounts, partialErrors, cursor });
  }

  const result: SessionPreloadResult = {
    startedAt,
    completedAt: new Date().toISOString(),
    fullySynced: pulls.length > 0 && pulls.every((pull) => pull.success) && partialErrors.length === 0,
    pulls,
  };
  lastPreloadResult = result;
  return result;
}

async function applyEntity(entity: string, records: unknown[], businessId: string): Promise<number> {
  switch (entity) {
    case "business_profile": return applyBusinessProfile(records, businessId);
    case "customers": return applyCustomers(records, businessId);
    case "credit_movements": return applyCreditMovements(records, businessId);
    case "branches": return applyBranches(records, businessId);
    case "categories": return applyCategories(records, businessId);
    case "products": return applyProducts(records, businessId);
    case "suppliers": return applySuppliers(records, businessId);
    case "inventory": return applyInventory(records, businessId);
    case "expenses": return applyExpenses(records, businessId);
    case "purchases": return applyPurchases(records, businessId);
    case "sales": return applySales(records, businessId);
    default: throw new Error(`Unsupported pull entity: ${entity}`);
  }
}

async function applyBusinessProfile(records: unknown[], businessId: string): Promise<number> {
  const profile = (records as Array<Record<string, unknown>>).find((row) => row.id === businessId);
  if (!profile) return 0;
  await db.businessProfile.put({ id: "singleton", businessId, name: String(profile.name ?? ""), businessTypeId: String(profile.business_type ?? "general_retail"), currency: String(profile.currency ?? "NGN"), ...(typeof profile.owing_message_template === "string" ? { owingMessageTemplate: profile.owing_message_template } : {}) });
  return 1;
}

async function pendingIds(businessId: string, type: string): Promise<Set<string>> {
  return new Set((await db.outbox.toArray())
    .filter((item) => item.businessId === businessId && item.type === type && PROTECTED_OUTBOX_STATUSES.includes(item.status))
    .map((item) => item.entityId ?? ((item.payload as { id?: string }).id) ?? item.clientId));
}

async function applyCustomers(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "customer");
  const customers = (records as ServerCustomerItem[]).filter((customer) => !protectedIds.has(customer.id));
  await db.transaction("rw", db.customers, db.customerCreditMovements, async () => {
    for (const customer of customers) {
      await db.customers.put({ id: customer.id, businessId, name: customer.name, phone: customer.phone ?? null, updatedAt: customer.updated_at } as LocalCustomer);
    }
  });
  return customers.length;
}

async function applyCreditMovements(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "credit_payment");
  const existing = await db.customerCreditMovements.toArray();
  const existingClientIds = new Set(existing.filter((row) => row.businessId === businessId).map((row) => row.clientId));
  const movements = (records as Array<Record<string, unknown>>).filter((movement) => {
    const clientId = String(movement.client_id ?? movement.id);
    return !protectedIds.has(clientId) && !existingClientIds.has(clientId);
  });
  await db.customerCreditMovements.bulkPut(movements.map((movement) => ({
    id: String(movement.id), clientId: String(movement.client_id ?? movement.id), businessId,
    customerId: String(movement.customer_id), amountDelta: Number(movement.amount_delta ?? 0),
    sourceReferenceId: (movement.source_reference_id as string) ?? null,
    createdAtLocal: String(movement.created_at_local ?? movement.created_at),
    createdByUserId: String(movement.created_by_user_id ?? "server-sync"),
  })));
  return movements.length;
}

async function applySuppliers(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "supplier");
  const suppliers = (records as ServerSupplier[]).filter((supplier) => !protectedIds.has(supplier.id));
  await db.suppliers.bulkPut(suppliers.map((supplier) => ({ id: supplier.id, businessId, name: supplier.name, phone: supplier.phone ?? null, updatedAt: supplier.updated_at })));
  return suppliers.length;
}

async function applyInventory(records: unknown[], businessId: string): Promise<number> {
  const stock = (records as Array<{ product_id: string; branch_id: string; quantity: number; updated_at: string }>).map((row) => ({
    id: `${businessId}:${row.product_id}:${row.branch_id}`, businessId, productId: row.product_id, branchId: row.branch_id, quantity: Number(row.quantity ?? 0), updatedAt: row.updated_at,
  } as LocalInventoryStock));
  await db.inventoryStock.bulkPut(stock);
  return stock.length;
}

async function applyBranches(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "branch");
  const branches = (records as Array<{ id: string; name: string; is_active?: boolean; is_primary?: boolean }>).filter((branch) => !protectedIds.has(branch.id));
  await db.branches.bulkPut(branches.map((branch) => ({ id: branch.id, businessId, name: branch.name, isActive: branch.is_active !== false, isPrimary: branch.is_primary === true } as LocalBranch)));
  return branches.length;
}

async function applyCategories(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "category");
  const categories = (records as Array<{ id: string; name: string }>).filter((category) => !protectedIds.has(category.id));
  await db.categories.bulkPut(categories.map((category) => ({ id: category.id, businessId, name: category.name } as LocalCategory)));
  return categories.length;
}

async function applyProducts(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "product");
  const products = (records as Array<Record<string, unknown>>).filter((product) => !protectedIds.has(String(product.id))).map((product) => ({
    id: product.id as string, businessId, name: product.name as string, sku: (product.sku as string) || "", barcode: (product.barcode as string) || null,
    categoryId: (product.category_id as string) || null, brandId: (product.brand_id as string) || null, costPrice: Number(product.cost_price ?? 0), sellPrice: Number(product.sell_price ?? 0),
    lowStockThreshold: product.low_stock_threshold == null ? null : Number(product.low_stock_threshold), unitLabel: (product.unit_label as string) || "piece",
    altUnitLabel: (product.alt_unit_label as string) || null, altUnitConversionFactor: product.alt_unit_conversion_factor == null ? null : Number(product.alt_unit_conversion_factor), altUnitSellPrice: product.alt_unit_sell_price == null ? null : Number(product.alt_unit_sell_price),
    expiryTracking: (product.expiry_tracking as Product["expiryTracking"]) || "off", expiryDate: (product.expiry_date as string) || null, archived: Boolean(product.archived), version: Number(product.version ?? 1), updatedAt: (product.updated_at as string) || new Date().toISOString(),
  } as Product));
  await db.products.bulkPut(products);
  return products.length;
}

async function applyExpenses(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "expense");
  const expenses = (records as Array<Record<string, unknown>>).filter((expense) => !protectedIds.has(String(expense.id)));
  await db.expenses.bulkPut(expenses.map((expense) => ({ id: expense.id as string, businessId, branchId: (expense.branch_id as string) || null, category: (expense.category as string) || "general", amount: Number(expense.amount ?? 0), note: (expense.note as string) || null, createdAtLocal: (expense.created_at as string) || new Date().toISOString(), createdByUserId: (expense.created_by_user_id as string) || "server-sync" } as Expense)));
  return expenses.length;
}

async function applyPurchases(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "purchase_receipt");
  const purchases = (records as Array<Record<string, unknown>>).filter((purchase) => !protectedIds.has(String(purchase.id)));
  await db.purchases.bulkPut(purchases.map((purchase) => ({ id: purchase.id as string, clientId: (purchase.client_id as string) || (purchase.id as string), businessId, branchId: (purchase.branch_id as string) || "", supplierId: (purchase.supplier_id as string) || "", createdAtLocal: (purchase.created_at as string) || new Date().toISOString(), items: (purchase.items as Array<Record<string, unknown>> ?? []).map((item) => ({ productId: (item.product_id as string) || "", quantity: Number(item.quantity ?? 0), unitCost: Number(item.unit_cost ?? 0) })) } as Purchase)));
  return purchases.length;
}

async function applySales(records: unknown[], businessId: string): Promise<number> {
  const protectedIds = await pendingIds(businessId, "sale");
  const sales = (records as Array<Record<string, unknown>>).filter((sale) => !protectedIds.has(String(sale.id)));
  await db.sales.bulkPut(sales.map((sale) => ({
    id: sale.id as string, clientId: (sale.client_id as string) || (sale.id as string), businessId, branchId: (sale.branch_id as string) || "", customerId: (sale.customer_id as string) || null,
    subtotal: Number(sale.subtotal ?? 0), discount: Number(sale.discount ?? 0), total: Number(sale.total ?? 0), payments: (sale.payments as Array<{ method: string; amount: number; tendered_amount?: number; note?: string }> ?? []).map((payment) => ({ method: payment.method as Sale["payments"][0]["method"], amount: Number(payment.amount), ...(payment.tendered_amount !== undefined ? { tenderedAmount: Number(payment.tendered_amount) } : {}), ...(payment.note !== undefined ? { note: payment.note } : {}) })),
    items: (sale.items as Array<Record<string, unknown>> ?? []).map((item) => ({ productId: (item.product_id as string) || "", quantity: Number(item.quantity ?? 0), unitPrice: Number(item.unit_price ?? 0), discount: Number(item.discount ?? 0), unitLabel: (item.unit_label as string) || "piece", conversionFactor: Number(item.unit_conversion_factor ?? 1), movementClientId: (item.movement_client_id as string) || `sync-mvt-${sale.id}` })),
    createdAtLocal: (sale.created_at_local as string) || (sale.created_at as string) || new Date().toISOString(), createdAt: (sale.created_at as string) || new Date().toISOString(), createdByUserId: (sale.created_by_user_id as string) || "server-sync", voidedAt: (sale.voided_at as string) || null,
  } as Sale)));
  return sales.length;
}

async function storeDiagnostic(businessId: string, result: PullEndpointResult): Promise<void> {
  const existing = await db.syncDiagnostics.get(`${businessId}:${result.entity}`);
  const diagnostic: SyncDiagnostic = {
    id: `${businessId}:${result.entity}`, businessId, endpoint: result.endpoint, entity: result.entity, success: result.success,
    lastAttemptedAt: new Date().toISOString(), lastSuccessfulPullAt: result.lastSuccessfulPullAt ?? existing?.lastSuccessfulPullAt ?? null,
    errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null, recordsApplied: result.recordsApplied,
  };
  await db.syncDiagnostics.put(diagnostic);
}

async function previousSuccessfulPullAt(businessId: string, entity: string): Promise<string | null> {
  return (await db.syncDiagnostics.get(`${businessId}:${entity}`))?.lastSuccessfulPullAt ?? null;
}

function safePullError(error: unknown): { code: string; message: string } {
  if (error instanceof BackendRequestError) return { code: error.code, message: error.message };
  if (error instanceof NetworkUnavailableError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "PULL_APPLY_FAILED", message: error.message || "Could not apply this data." };
  return { code: "PULL_APPLY_FAILED", message: "Could not apply this data." };
}
