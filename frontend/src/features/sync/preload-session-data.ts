import { BackendRequestError, NetworkUnavailableError, serverGet } from "@/features/operations/server-client";
import { db, SESSION_SINGLETON_ID, type LocalBranch, type LocalCategory, type LocalCustomer, type LocalUser, type SyncDiagnostic, type LocalInventoryStock } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Sale } from "@/types/sale";
import type { SyncQueueItem } from "@/types/sync";

let lastPreloadAt = 0;
let lastPreloadResult: SessionPreloadResult | null = null;
// The active-app fallback is intentionally bounded to the SyncEngine's
// three-minute scheduler. It is a check-for-changes request, not a full database
// download: the server cursor only returns rows newer than the last completed
// watermark.
const PRELOAD_THROTTLE_MS = 3 * 60 * 1000;
const PROTECTED_OUTBOX_STATUSES = ["pending", "syncing", "blocked", "failed", "conflict"];
const MAX_PULL_RETRY_COUNT = 6;
const BASE_PULL_RETRY_MS = 5_000;
const MAX_PULL_RETRY_MS = 5 * 60_000;
const PULL_ENTITIES = [
  "business_profile", "customers", "credit_movements", "branches", "categories",
  "products", "suppliers", "inventory", "expenses", "purchases", "sales",
] as const;
type PullEntityName = (typeof PULL_ENTITIES)[number];
const PULL_ENTITY_SET = new Set<string>(PULL_ENTITIES);
const APPLY_ORDER: PullEntityName[] = [
  "business_profile", "branches", "categories", "products", "suppliers",
  "customers", "credit_movements", "expenses", "purchases", "sales", "inventory",
];

export type SyncPullTrigger =
  | "boot"
  | "poll"
  | "online"
  | "auth"
  | "focus"
  | "push-success"
  | "manual";

export interface PullEndpointResult {
  endpoint: string;
  entity: string;
  success: boolean;
  lastSuccessfulPullAt: string | null;
  error: { code: string; message: string } | null;
  httpStatus: number | null;
  recordsApplied: number;
}

export interface SessionPreloadResult {
  startedAt: string;
  completedAt: string;
  fullySynced: boolean;
  pulls: PullEndpointResult[];
}

interface SessionPullResponse {
  ok: true;
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

interface ServerInventoryRow {
  product_id: string;
  branch_id: string;
  quantity: number;
  updated_at: string;
}

class PullProcessError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly dataset: string | null = null,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
  }
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
  const initialCursor = priorState?.cursor ?? null;
  const bypassBackoff = trigger === "manual" || trigger === "push-success" || (trigger === "online" && priorState?.lastPullErrorCode === "NETWORK_UNAVAILABLE");
  if (!bypassBackoff && priorState?.nextPullAttemptAt && priorState.nextPullAttemptAt > startedAt) {
    return lastPreloadResult ?? empty(false);
  }
  let cursor = initialCursor;
  let pagesFetched = 0;
  const entityCounts: Record<string, number> = {};
  const partialErrors: string[] = [];
  const stagedRecords = new Map<PullEntityName, unknown[]>();
  const successfulPullAt = new Map<PullEntityName, string | null>();
  const pullStartedAt = new Date().toISOString();
  const isInvalidationTrigger = ["online", "auth", "focus", "push-success"].includes(trigger);
  await db.syncPullState.put({
    ...(priorState ?? {}),
    id: pullStateId,
    businessId,
    cursor: initialCursor,
    startedAt: pullStartedAt,
    completedAt: priorState?.completedAt ?? null,
    pagesFetched: 0,
    entityCounts: {},
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
      const rawResponse = await serverGet<unknown>(`/api/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      await db.syncPullState.update(pullStateId, { lastServerContactAt: new Date().toISOString() });
      response = validateSessionPullResponse(rawResponse, businessId, localUser);
      pagesFetched += 1;
      for (const entity of response.entities ?? []) {
        const entityName = entity.entity as PullEntityName;
        if (!entity.success) {
          const error = entity.error ?? { code: "PULL_FAILED", message: "Could not refresh this data." };
          const result: PullEndpointResult = {
            endpoint: "/api/sync/pull",
            entity: entityName,
            success: false,
            lastSuccessfulPullAt: await previousSuccessfulPullAt(businessId, entityName),
            error,
            httpStatus: null,
            recordsApplied: 0,
          };
          pulls.push(result);
          partialErrors.push(`${entityName}:${error.code}`);
          await storeDiagnostic(businessId, result, priorState?.pullRetryCount ?? 0);
          continue;
        }
        const existing = stagedRecords.get(entityName) ?? [];
        stagedRecords.set(entityName, [...existing, ...entity.records]);
        successfulPullAt.set(entityName, entity.lastSuccessfulPullAt);
      }
      if (partialErrors.length) {
        const [dataset, code = "PULL_FAILED"] = partialErrors[0].split(":");
        throw new PullProcessError(code, "One or more datasets could not be refreshed.", dataset);
      }
      cursor = response.nextCursor ?? response.cursor;
    } while (response.hasMore);

    // Apply inventory last. A valid stock projection is never committed when
    // another dataset failed validation or application in the same pull.
    for (const entityName of APPLY_ORDER) {
      const records = stagedRecords.get(entityName);
      if (!records) continue;
      let recordsApplied: number;
      try {
        recordsApplied = await applyEntity(entityName, records, businessId);
      } catch (cause) {
        const safe = safePullError(cause);
        throw new PullProcessError(safe.code, safe.message, entityName, safe.httpStatus);
      }
      entityCounts[entityName] = recordsApplied;
      const result: PullEndpointResult = {
        endpoint: "/api/sync/pull",
        entity: entityName,
        success: true,
        lastSuccessfulPullAt: successfulPullAt.get(entityName) ?? new Date().toISOString(),
        error: null,
        httpStatus: 200,
        recordsApplied,
      };
      pulls.push(result);
      await storeDiagnostic(businessId, result, 0);
    }

    await db.syncPullState.update(pullStateId, {
      cursor,
      completedAt: new Date().toISOString(),
      pagesFetched,
      entityCounts,
      partialErrors,
      lastCompletePullAt: response.serverTime ?? new Date().toISOString(),
      lastPullStatus: "success",
      lastPullErrorCode: null,
      lastPullHttpStatus: 200,
      lastFailedDataset: null,
      pullRetryCount: 0,
      nextPullAttemptAt: null,
    });
    await storeDiagnostic(businessId, {
      endpoint: "/api/sync/pull",
      entity: "session",
      success: true,
      lastSuccessfulPullAt: response.serverTime ?? new Date().toISOString(),
      error: null,
      httpStatus: 200,
      recordsApplied: Object.values(entityCounts).reduce((total, count) => total + count, 0),
    }, 0);
  } catch (cause) {
    const error = safePullError(cause);
    const failedDataset = cause instanceof PullProcessError ? cause.dataset : null;
    const retryCount = Math.min(MAX_PULL_RETRY_COUNT, (priorState?.pullRetryCount ?? 0) + 1);
    const nextPullAttemptAt = new Date(Date.now() + pullRetryDelayMs(retryCount)).toISOString();
    const result: PullEndpointResult = {
      endpoint: "/api/sync/pull",
      entity: "session",
      success: false,
      lastSuccessfulPullAt: await previousSuccessfulPullAt(businessId, "session"),
      error: { code: error.code, message: error.message },
      httpStatus: error.httpStatus,
      recordsApplied: 0,
    };
    pulls.push(result);
    await storeDiagnostic(businessId, result, retryCount);
    await db.syncPullState.update(pullStateId, {
      startedAt: pullStartedAt,
      pagesFetched,
      entityCounts,
      partialErrors,
      cursor: initialCursor,
      lastPullStatus: "failed",
      lastPullErrorCode: error.code,
      lastPullHttpStatus: error.httpStatus,
      lastFailedDataset: failedDataset,
      pullRetryCount: retryCount,
      nextPullAttemptAt,
    });
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

function validateSessionPullResponse(raw: unknown, businessId: string, localUser: LocalUser | undefined): SessionPullResponse {
  if (!isRecord(raw) || raw.ok !== true || raw.businessId !== businessId) {
    throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned an invalid sync context.", "session");
  }
  requireTimestamp(raw.serverTime, "serverTime", "session");
  if (typeof raw.hasMore !== "boolean" || !Array.isArray(raw.entities)) {
    throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned an incomplete sync response.", "session");
  }
  if (raw.cursor !== null && typeof raw.cursor !== "string") {
    throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned an invalid completed cursor.", "session");
  }
  if (raw.nextCursor !== null && typeof raw.nextCursor !== "string") {
    throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned an invalid continuation cursor.", "session");
  }
  if (raw.hasMore && (typeof raw.nextCursor !== "string" || raw.nextCursor.length === 0)) {
    throw new PullProcessError("PULL_INVALID_RESPONSE", "The server omitted the next sync cursor.", "session");
  }
  if (!raw.hasMore && (typeof raw.cursor !== "string" || raw.cursor.length === 0)) {
    throw new PullProcessError("PULL_INVALID_RESPONSE", "The server omitted the completed sync cursor.", "session");
  }

  const seenEntities = new Set<string>();
  const entities = raw.entities.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.entity !== "string" || !PULL_ENTITY_SET.has(candidate.entity)) {
      throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned an unknown dataset.", "session");
    }
    if (seenEntities.has(candidate.entity)) {
      throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned a dataset more than once in one page.", candidate.entity);
    }
    seenEntities.add(candidate.entity);
    if (typeof candidate.success !== "boolean" || !Array.isArray(candidate.records)) {
      throw new PullProcessError("PULL_INVALID_RESPONSE", "The server returned an invalid dataset result.", candidate.entity);
    }
    const error = candidate.error;
    if (candidate.success && error !== null) {
      throw new PullProcessError("PULL_INVALID_RESPONSE", "A successful dataset included an error.", candidate.entity);
    }
    if (!candidate.success && (!isRecord(error) || typeof error.code !== "string" || typeof error.message !== "string")) {
      throw new PullProcessError("PULL_INVALID_RESPONSE", "A failed dataset omitted safe error details.", candidate.entity);
    }
    if (candidate.lastSuccessfulPullAt !== null) requireTimestamp(candidate.lastSuccessfulPullAt, "lastSuccessfulPullAt", candidate.entity);
    if (candidate.success) validateEntityRecords(candidate.entity as PullEntityName, candidate.records, localUser);
    return {
      entity: candidate.entity,
      success: candidate.success,
      records: candidate.records,
      lastSuccessfulPullAt: candidate.lastSuccessfulPullAt as string | null,
      error: error as { code: string; message: string } | null,
    };
  });

  return {
    ok: true,
    businessId,
    serverTime: raw.serverTime as string,
    cursor: raw.cursor as string | null,
    nextCursor: raw.nextCursor as string | null,
    hasMore: raw.hasMore,
    entities,
  };
}

function validateEntityRecords(entity: PullEntityName, records: unknown[], localUser: LocalUser | undefined): void {
  for (const value of records) {
    if (!isRecord(value)) throw new PullProcessError("PULL_INVALID_RESPONSE", "A dataset contained an invalid record.", entity);
    switch (entity) {
      case "business_profile":
        requireString(value.id, "id", entity); requireString(value.name, "name", entity); requireTimestamp(value.updated_at, "updated_at", entity); break;
      case "customers":
        requireString(value.id, "id", entity); requireString(value.name, "name", entity); requireTimestamp(value.updated_at, "updated_at", entity); break;
      case "credit_movements":
        requireString(value.id, "id", entity); requireString(value.customer_id, "customer_id", entity); requireFiniteNumber(value.amount_delta, "amount_delta", entity); requireTimestamp(value.created_at, "created_at", entity); break;
      case "branches":
        requireString(value.id, "id", entity); requireString(value.name, "name", entity); requireTimestamp(value.updated_at, "updated_at", entity); break;
      case "categories":
        requireString(value.id, "id", entity); requireString(value.name, "name", entity); requireTimestamp(value.created_at, "created_at", entity); break;
      case "products":
        requireString(value.id, "id", entity); requireString(value.name, "name", entity); requireString(value.sku, "sku", entity); requireFiniteNumber(value.cost_price, "cost_price", entity); requireFiniteNumber(value.sell_price, "sell_price", entity); requireTimestamp(value.updated_at, "updated_at", entity); break;
      case "suppliers":
        requireString(value.id, "id", entity); requireString(value.name, "name", entity); requireTimestamp(value.updated_at, "updated_at", entity); break;
      case "inventory": {
        requireString(value.product_id, "product_id", entity);
        const branchId = requireString(value.branch_id, "branch_id", entity);
        const quantity = requireFiniteNumber(value.quantity, "quantity", entity);
        if (!Number.isInteger(quantity)) throw new PullProcessError("PULL_INVALID_RESPONSE", "Inventory quantity must be a whole number.", entity);
        requireTimestamp(value.updated_at, "updated_at", entity);
        if (localUser?.accountType === "WORKER" && !(localUser.branchIds ?? []).includes(branchId)) {
          throw new PullProcessError("PULL_BRANCH_SCOPE_MISMATCH", "The server returned stock outside this worker's branch scope.", entity);
        }
        break;
      }
      case "expenses":
        requireString(value.id, "id", entity); requireFiniteNumber(value.amount, "amount", entity); requireTimestamp(value.created_at, "created_at", entity); break;
      case "purchases":
        requireString(value.id, "id", entity); requireString(value.branch_id, "branch_id", entity); requireString(value.supplier_id, "supplier_id", entity); requireTimestamp(value.created_at, "created_at", entity); requireArray(value.items, "items", entity); break;
      case "sales":
        requireString(value.id, "id", entity); requireString(value.branch_id, "branch_id", entity); requireFiniteNumber(value.total, "total", entity); requireTimestamp(value.created_at, "created_at", entity); requireArray(value.items, "items", entity); requireArray(value.payments, "payments", entity); break;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string, dataset: string): string {
  if (typeof value !== "string" || value.length === 0) throw new PullProcessError("PULL_INVALID_RESPONSE", `The ${dataset} dataset omitted ${field}.`, dataset);
  return value;
}

function requireFiniteNumber(value: unknown, field: string, dataset: string): number {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) {
    throw new PullProcessError("PULL_INVALID_RESPONSE", `The ${dataset} dataset has an invalid ${field}.`, dataset);
  }
  return Number(value);
}

function requireTimestamp(value: unknown, field: string, dataset: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new PullProcessError("PULL_INVALID_RESPONSE", `The ${dataset} dataset has an invalid ${field}.`, dataset);
  }
  return value;
}

function requireArray(value: unknown, field: string, dataset: string): unknown[] {
  if (!Array.isArray(value)) throw new PullProcessError("PULL_INVALID_RESPONSE", `The ${dataset} dataset omitted ${field}.`, dataset);
  return value;
}

function pullRetryDelayMs(retryCount: number): number {
  return Math.min(MAX_PULL_RETRY_MS, BASE_PULL_RETRY_MS * 2 ** Math.max(0, retryCount - 1));
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
  const rows = records as ServerInventoryRow[];
  const stock = rows.map((row) => ({
    id: `${businessId}:${row.product_id}:${row.branch_id}`,
    businessId,
    productId: row.product_id,
    branchId: row.branch_id,
    quantity: Number(row.quantity),
    updatedAt: row.updated_at,
  } as LocalInventoryStock));
  const receivedKeys = new Set(rows.map((row) => `${row.product_id}:${row.branch_id}`));

  await db.transaction("rw", db.inventoryStock, db.outbox, async () => {
    if (stock.length > 0) await db.inventoryStock.bulkPut(stock);
    const awaitingConfirmation = (await db.outbox.where("status").equals("syncing").toArray())
      .filter((item) => item.businessId === businessId && item.awaitingConfirmation);
    const confirmed = awaitingConfirmation.filter((item) => {
      const keys = stockKeysForMutation(item);
      return keys.length > 0 && keys.every((key) => receivedKeys.has(key));
    });
    if (confirmed.length > 0) await db.outbox.bulkDelete(confirmed.map((item) => item.clientId));
  });
  return stock.length;
}

function stockKeysForMutation(item: SyncQueueItem): string[] {
  if (!isRecord(item.payload)) return [];
  const branchId = item.payload.branchId;
  if (typeof branchId !== "string" || !branchId) return [];
  if (item.type === "stock_adjustment" || item.type === "stock_count_submission") {
    const productId = item.payload.productId;
    return typeof productId === "string" && productId ? [`${productId}:${branchId}`] : [];
  }
  if (item.type === "sale" || item.type === "purchase_receipt") {
    const items = item.payload.items;
    if (!Array.isArray(items)) return [];
    return [...new Set(items.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate.productId !== "string" || !candidate.productId) return [];
      return [`${candidate.productId}:${branchId}`];
    }))];
  }
  return [];
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
  const incomingIds = new Set(categories.map((category) => category.id));
  await db.transaction("rw", db.categories, db.products, db.outbox, async () => {
    await db.categories.bulkPut(categories.map((category) => ({ id: category.id, businessId, name: category.name } as LocalCategory)));

    // A previous client version could leave two local rows that differ only by
    // case. The server's case-insensitive unique index is authoritative, so
    // coalesce only unprotected duplicates to the server row and carry the
    // canonical id through local products and pending mutations.
    const allCategories = (await db.categories.toArray()).filter((category) => category.businessId === businessId);
    const products = await db.products.toArray();
    const outbox = await db.outbox.toArray();
    const winners = new Map<string, LocalCategory>();
    for (const candidate of allCategories) {
      const key = candidate.name.trim().toLocaleLowerCase();
      const current = winners.get(key);
      if (!current || (incomingIds.has(candidate.id) && !incomingIds.has(current.id))) winners.set(key, candidate);
    }

    for (const winner of winners.values()) {
      const duplicateIds = allCategories
        .filter((candidate) => candidate.id !== winner.id && candidate.name.trim().toLocaleLowerCase() === winner.name.trim().toLocaleLowerCase())
        .map((candidate) => candidate.id);
      for (const duplicateId of duplicateIds) {
        if (protectedIds.has(duplicateId)) continue;
        for (const product of products) {
          if (product.businessId === businessId && product.categoryId === duplicateId) {
            await db.products.update(product.id, { categoryId: winner.id });
          }
        }
        for (const item of outbox) {
          if (item.businessId !== businessId || !isRecord(item.payload)) continue;
          const payload = item.payload.categoryId === duplicateId
            ? { ...item.payload, categoryId: winner.id }
            : item.payload;
          const dependencies = (item.dependsOn ?? []).map((dependency) => dependency === duplicateId ? winner.id : dependency);
          if (payload !== item.payload || dependencies.some((dependency, index) => dependency !== (item.dependsOn ?? [])[index])) {
            await db.outbox.update(item.clientId, { payload, dependsOn: dependencies, dependsOnMutationIds: dependencies });
          }
        }
        await db.categories.delete(duplicateId);
      }
    }
  });
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

async function storeDiagnostic(businessId: string, result: PullEndpointResult, retryCount: number): Promise<void> {
  const existing = await db.syncDiagnostics.get(`${businessId}:${result.entity}`);
  const diagnostic: SyncDiagnostic = {
    id: `${businessId}:${result.entity}`, businessId, endpoint: result.endpoint, entity: result.entity, success: result.success,
    lastAttemptedAt: new Date().toISOString(), lastSuccessfulPullAt: result.lastSuccessfulPullAt ?? existing?.lastSuccessfulPullAt ?? null,
    errorCode: result.error?.code ?? null, errorMessage: result.error?.message ?? null,
    httpStatus: result.httpStatus, retryCount, recordsApplied: result.recordsApplied,
  };
  await db.syncDiagnostics.put(diagnostic);
}

async function previousSuccessfulPullAt(businessId: string, entity: string): Promise<string | null> {
  return (await db.syncDiagnostics.get(`${businessId}:${entity}`))?.lastSuccessfulPullAt ?? null;
}

function safePullError(error: unknown): { code: string; message: string; httpStatus: number | null } {
  if (error instanceof PullProcessError) return { code: error.code, message: error.message, httpStatus: error.httpStatus };
  if (error instanceof BackendRequestError) {
    if (error.status >= 500) return { code: "PULL_FAILED", message: "We couldn't download the latest data from the cloud.", httpStatus: error.status };
    return { code: error.code, message: error.message, httpStatus: error.status };
  }
  if (error instanceof NetworkUnavailableError) return { code: error.code, message: error.message, httpStatus: null };
  if (error instanceof Error) return { code: "PULL_APPLY_FAILED", message: error.message || "Could not apply this data.", httpStatus: null };
  return { code: "PULL_APPLY_FAILED", message: "Could not apply this data.", httpStatus: null };
}
