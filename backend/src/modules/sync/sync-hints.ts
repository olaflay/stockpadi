import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "../../shared/logging/logger.js";
import { supabaseAdmin } from "../../shared/supabase/client.js";
import {
  SYNC_HINT_EVENT,
  SYNC_SALE_EVENT,
  type SyncSaleRealtimeCreditMovement,
  type SyncSaleRealtimeEvent,
  type SyncSaleRealtimeItem,
  type SyncSaleRealtimePayment,
  type SyncSaleRealtimeSale,
  type SyncSaleRealtimeStockMovement,
} from "../../shared/contracts.generated.js";

export const SYNC_TOPIC_PREFIX = "sync:business:";
const SYNC_HINT_TIMEOUT_MS = 3_000;

export function businessSyncTopic(businessId: string): string {
  return `${SYNC_TOPIC_PREFIX}${businessId}`;
}

export function branchSyncTopic(businessId: string, branchId: string): string {
  return `${businessSyncTopic(businessId)}:branch:${branchId}`;
}

/**
 * Publish a post-commit hint before the request is allowed to finish.
 *
 * The durable database write remains authoritative and publication failures
 * are swallowed by publishSyncHints. Awaiting here is still important: a
 * serverless runtime may stop executing fire-and-forget promises as soon as
 * the HTTP handler returns, which made realtime wake-ups disappear.
 */
export async function queueSyncHints(businessId: string, branchIds: Array<string | null | undefined>): Promise<void> {
  try {
    await publishSyncHints(supabaseAdmin(), businessId, branchIds);
  } catch (cause) {
    logger.error("sync hint client unavailable", { businessId, realtimePublishFailure: true }, cause);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

type SaleRow = Record<string, unknown>;

/**
 * Builds an event only from a complete, non-voided server record. Keeping this
 * pure makes it possible to prove that incomplete carts and partial query
 * results can never be broadcast as completed sales.
 */
export function buildCommittedSaleEvent(
  businessId: string,
  scope: string,
  sale: SaleRow,
  itemRows: SaleRow[],
  paymentRows: SaleRow[],
  stockRows: SaleRow[],
  creditRows: SaleRow[],
): SyncSaleRealtimeEvent | null {
  const saleId = stringValue(sale.id);
  const branchId = stringValue(sale.branch_id);
  const workerId = stringValue(sale.created_by_user_id);
  const clientId = stringValue(sale.client_id);
  const subtotal = numberValue(sale.subtotal);
  const discount = numberValue(sale.discount);
  const total = numberValue(sale.total);
  const createdAtLocal = stringValue(sale.created_at_local);
  const createdAt = stringValue(sale.created_at);
  if (!saleId || !branchId || !workerId || !clientId || subtotal === null || discount === null || total === null || !createdAtLocal || !createdAt || (sale.voided_at !== null && sale.voided_at !== undefined)) {
    return null;
  }
  if (itemRows.length === 0 || paymentRows.length === 0) return null;

  const stockByProduct = new Map<string, SyncSaleRealtimeStockMovement[]>();
  const stockMovements: SyncSaleRealtimeStockMovement[] = [];
  for (const row of stockRows) {
    const id = stringValue(row.id);
    const movementClientId = stringValue(row.client_id);
    const movementBusinessId = stringValue(row.business_id);
    const movementBranchId = stringValue(row.branch_id);
    const productId = stringValue(row.product_id);
    const quantityDelta = numberValue(row.quantity_delta);
    const sourceReferenceId = stringValue(row.source_reference_id);
    const createdMovementAtLocal = stringValue(row.created_at_local);
    const createdMovementAt = stringValue(row.created_at);
    const createdByUserId = stringValue(row.created_by_user_id);
    if (!id || !movementClientId || movementBusinessId !== businessId || movementBranchId !== branchId || !productId || quantityDelta === null || sourceReferenceId !== saleId || row.source !== "sale" || !createdMovementAtLocal || !createdMovementAt || !createdByUserId) continue;
    const movement: SyncSaleRealtimeStockMovement = {
      id,
      clientId: movementClientId,
      businessId: movementBusinessId,
      branchId: movementBranchId,
      productId,
      quantityDelta,
      source: "sale",
      sourceReferenceId,
      reasonCode: nullableString(row.reason_code),
      createdAtLocal: createdMovementAtLocal,
      createdAt: createdMovementAt,
      createdByUserId,
    };
    stockMovements.push(movement);
    const productMovements = stockByProduct.get(productId) ?? [];
    productMovements.push(movement);
    stockByProduct.set(productId, productMovements);
  }
  if (stockMovements.length === 0 || stockMovements.length !== stockRows.length) return null;

  const items: SyncSaleRealtimeItem[] = [];
  for (const row of itemRows) {
    const productId = stringValue(row.product_id);
    const quantity = numberValue(row.quantity);
    const unitPrice = numberValue(row.unit_price);
    const itemDiscount = numberValue(row.discount);
    const unitLabel = stringValue(row.unit_label);
    const conversionFactor = numberValue(row.unit_conversion_factor);
    if (!productId || quantity === null || unitPrice === null || itemDiscount === null || !unitLabel || conversionFactor === null) return null;
    const productMovements = stockByProduct.get(productId) ?? [];
    const movement = productMovements.shift();
    if (!movement) return null;
    items.push({
      productId,
      quantity,
      unitPrice,
      discount: itemDiscount,
      unitLabel,
      conversionFactor,
      movementClientId: movement.clientId,
      unitCost: numberValue(row.unit_cost),
      costBasis: nullableString(row.cost_basis),
      productVersion: numberValue(row.product_version),
      costFlags: Array.isArray(row.cost_flags) ? row.cost_flags.filter((flag): flag is string => typeof flag === "string") : null,
    });
  }

  if (items.length !== itemRows.length) return null;

  const payments: SyncSaleRealtimePayment[] = [];
  for (const row of paymentRows) {
    const method = stringValue(row.method);
    const amount = numberValue(row.amount);
    if (!method || amount === null) return null;
    payments.push({
      method,
      amount,
      ...(numberValue(row.tendered_amount) !== null ? { tenderedAmount: numberValue(row.tendered_amount)! } : {}),
      ...(typeof row.note === "string" ? { note: row.note } : {}),
    });
  }

  if (payments.length !== paymentRows.length) return null;

  const creditMovements: SyncSaleRealtimeCreditMovement[] = [];
  for (const row of creditRows) {
    const id = stringValue(row.id);
    const movementClientId = stringValue(row.client_id);
    const movementBusinessId = stringValue(row.business_id);
    const customerId = stringValue(row.customer_id);
    const amountDelta = numberValue(row.amount_delta);
    const sourceReferenceId = stringValue(row.source_reference_id);
    const movementCreatedAtLocal = stringValue(row.created_at_local);
    const movementCreatedAt = stringValue(row.created_at);
    const movementCreatedByUserId = stringValue(row.created_by_user_id);
    if (!id || !movementClientId || movementBusinessId !== businessId || !customerId || amountDelta === null || sourceReferenceId !== saleId || !movementCreatedAtLocal || !movementCreatedAt || !movementCreatedByUserId) return null;
    creditMovements.push({
      id,
      clientId: movementClientId,
      businessId: movementBusinessId,
      customerId,
      amountDelta,
      sourceReferenceId,
      createdAtLocal: movementCreatedAtLocal,
      createdAt: movementCreatedAt,
      createdByUserId: movementCreatedByUserId,
      note: nullableString(row.note),
    });
  }
  if (creditMovements.length !== creditRows.length) return null;

  const committedSale: SyncSaleRealtimeSale = {
    id: saleId,
    clientId,
    businessId,
    branchId,
    customerId: nullableString(sale.customer_id),
    subtotal,
    discount,
    total,
    createdAtLocal,
    createdAt,
    createdByUserId: workerId,
    workerId,
    voidedAt: null,
    items,
    payments,
    stockMovements,
    creditMovements,
  };
  return { type: SYNC_SALE_EVENT, scope, businessId, status: "completed", sale: committedSale };
}

/**
 * Broadcast is a wake-up optimization only. The durable cursor pull remains
 * authoritative, so every failure here is logged and deliberately swallowed
 * after the database transaction has already committed.
 */
export async function publishSyncHints(
  db: SupabaseClient,
  businessId: string,
  branchIds: Array<string | null | undefined>,
): Promise<void> {
  try {
    await publishSyncHintsUnsafe(db, businessId, branchIds);
  } catch (cause) {
    // A test double, a missing Realtime deployment, or a transient scope
    // lookup failure must never become an unhandled rejection in the mutation
    // path. The authoritative write has already committed.
    logger.error("sync hint publication unavailable", {
      trigger: "authoritative-commit",
      businessId,
      realtimePublishFailure: true,
    }, cause);
  }
}

async function publishSyncHintsUnsafe(
  db: SupabaseClient,
  businessId: string,
  branchIds: Array<string | null | undefined>,
): Promise<void> {
  const normalizedBranches = [...new Set(branchIds.filter((branchId): branchId is string => typeof branchId === "string" && branchId.length > 0))];
  let topics = new Set<string>([businessSyncTopic(businessId)]);

  // Business-wide mutations need to wake branch-scoped workers too. A branch
  // topic carries no business data; it only tells the worker to use its own
  // authorized HTTP cursor pull.
  if (branchIds.some((branchId) => branchId == null)) {
    const { data, error } = await db.from("branches").select("id").eq("business_id", businessId).eq("is_active", true);
    if (error) {
      logger.error("sync hint branch scope lookup failed", { businessId, code: "SYNC_HINT_SCOPE_LOOKUP_FAILED" }, error);
    } else {
      for (const branch of data ?? []) {
        if (typeof branch.id === "string") normalizedBranches.push(branch.id);
      }
    }
  }
  for (const branchId of normalizedBranches) topics.add(branchSyncTopic(businessId, branchId));

  const cursor = new Date().toISOString();
  await Promise.all([...topics].map(async (topic) => {
    await sendRealtimeBroadcast(db, topic, SYNC_HINT_EVENT, {
      type: SYNC_HINT_EVENT,
      scope: topic,
      cursor,
    }, businessId, "sync hint published", "sync hint publish failed");
  }));
}

async function sendRealtimeBroadcast(
  db: SupabaseClient,
  topic: string,
  event: string,
  payload: unknown,
  businessId: string,
  successMessage: string,
  failureMessage: string,
): Promise<void> {
  const channel = db.channel(topic, { config: { private: true } });
  try {
    const result = await channel.httpSend(event, payload, { timeout: SYNC_HINT_TIMEOUT_MS });
    if (!isRecord(result) || result.success !== true) {
      throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Realtime rejected the event");
    }
    logger.info(successMessage, { trigger: "authoritative-commit", businessId, scope: topic, event });
  } catch (cause) {
    logger.error(failureMessage, { trigger: "authoritative-commit", businessId, scope: topic, event, realtimePublishFailure: true }, cause);
  } finally {
    await db.removeChannel(channel);
  }
}

/**
 * Publishes full sale details only after the sale RPC has returned an applied
 * or already-applied result. The business topic is intentional: branch topics
 * are also available to cashiers, while the sales contract restricts workers
 * to their own sales. Owners/accountants/managers are authorized for the
 * business-wide topic by the existing Realtime policy.
 */
export async function publishCommittedSaleEvents(
  db: SupabaseClient,
  businessId: string,
  saleIds: string[],
): Promise<void> {
  const ids = [...new Set(saleIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) return;
  try {
    const [salesResult, itemsResult, paymentsResult, stockResult, creditResult] = await Promise.all([
      db.from("sales").select("id, client_id, business_id, branch_id, customer_id, subtotal, discount, total, created_at_local, created_at, created_by_user_id, voided_at").eq("business_id", businessId).in("id", ids),
      db.from("sale_items").select("sale_id, product_id, quantity, unit_price, discount, unit_label, unit_conversion_factor, unit_cost, cost_basis, product_version, cost_flags").in("sale_id", ids),
      db.from("sale_payments").select("sale_id, method, amount, tendered_amount, note").in("sale_id", ids),
      db.from("stock_movements").select("id, client_id, business_id, branch_id, product_id, quantity_delta, source, source_reference_id, reason_code, created_at_local, created_at, created_by_user_id").eq("business_id", businessId).eq("source", "sale").in("source_reference_id", ids),
      db.from("customer_credit_movements").select("id, client_id, business_id, customer_id, amount_delta, source_reference_id, note, created_at_local, created_at, created_by_user_id").eq("business_id", businessId).in("source_reference_id", ids),
    ]);
    const error = salesResult.error ?? itemsResult.error ?? paymentsResult.error ?? stockResult.error ?? creditResult.error;
    if (error) throw error;
    const sales = (salesResult.data ?? []) as SaleRow[];
    const items = (itemsResult.data ?? []) as SaleRow[];
    const payments = (paymentsResult.data ?? []) as SaleRow[];
    const stock = (stockResult.data ?? []) as SaleRow[];
    const credits = (creditResult.data ?? []) as SaleRow[];
    const topic = businessSyncTopic(businessId);
    await Promise.all(sales.map(async (sale) => {
      const saleId = stringValue(sale.id);
      if (!saleId) return;
      const event = buildCommittedSaleEvent(
        businessId,
        topic,
        sale,
        items.filter((row) => row.sale_id === saleId),
        payments.filter((row) => row.sale_id === saleId),
        stock.filter((row) => row.source_reference_id === saleId),
        credits.filter((row) => row.source_reference_id === saleId),
      );
      if (!event) {
        logger.warn("completed sale event skipped because the authoritative record was incomplete", { businessId, saleId });
        return;
      }
      await sendRealtimeBroadcast(db, topic, SYNC_SALE_EVENT, event, businessId, "completed sale event published", "completed sale event publish failed");
    }));
  } catch (cause) {
    // The HTTP cursor pull remains the recovery path if the event query or
    // publication fails. Never turn an already-committed sale into a failed
    // mutation because an optimization channel was unavailable.
    logger.error("completed sale event unavailable", { businessId, realtimePublishFailure: true }, cause);
  }
}
