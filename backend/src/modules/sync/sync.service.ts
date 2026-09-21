import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "../../shared/errors/http-error.js";
import { logger } from "../../shared/logging/logger.js";
import { resolveAccountContext } from "../accounts/account-context.js";
import { requireCapability, requireAssignedBranch, type Capability } from "../authorization/capabilities.js";
import { isSyncEntityType, type SyncEntityType } from "../../shared/contracts.generated.js";

const MAX_BATCH_SIZE = 500;

const RPC_BY_ENTITY: Record<SyncEntityType, string> = {
  sale: "sync_apply_sale",
  stock_adjustment: "sync_apply_stock_adjustment",
  stock_count_submission: "sync_apply_stock_count",
  purchase_receipt: "sync_apply_purchase_receipt",
  customer: "sync_apply_customer",
  product: "sync_apply_product",
  credit_payment: "sync_apply_credit_payment",
  expense: "sync_apply_expense",
  supplier: "sync_apply_supplier",
  branch: "sync_apply_branch",
  category: "sync_apply_category",
};

const WORKER_CAPABILITY_BY_ENTITY: Record<SyncEntityType, Capability> = {
  sale: "POS_SELL",
  stock_adjustment: "ADJUST_STOCK",
  stock_count_submission: "SUBMIT_STOCK_COUNT",
  purchase_receipt: "RECEIVE_STOCK",
  customer: "CREATE_CUSTOMERS",
  credit_payment: "RECORD_REPAYMENT",
  expense: "MANAGE_EXPENSES",
  product: "MANAGE_PRODUCTS",
  category: "MANAGE_PRODUCTS",
  supplier: "RECEIVE_STOCK",
  branch: "MANAGE_BRANCHES",
};

const IMMUTABLE_EVENTS = new Set<SyncEntityType>([
  "sale", "stock_adjustment", "stock_count_submission", "purchase_receipt", "credit_payment", "expense",
]);

interface SyncBatchItem {
  client_id: string;
  mutation_id: string;
  idempotency_key: string;
  entity_id?: string;
  operation?: "upsert" | "append";
  expected_version?: number;
  type: SyncEntityType;
  payload: unknown;
  created_at_local: string;
}

interface SyncBatchRequest {
  device_id?: string | null;
  batch: SyncBatchItem[];
}

interface SyncResult {
  clientId: string;
  mutationId: string;
  entityId?: string;
  submittedEntityId?: string;
  authoritativeEntityId?: string;
  canonicalized?: boolean;
  status: "applied" | "skipped" | "conflict" | "retryable_error" | "permanent_failure";
  version?: number;
  conflict?: boolean;
  error?: { code: string; message: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRequest(input: unknown): SyncBatchRequest {
  if (!isRecord(input) || !Array.isArray(input.batch)) {
    throw new HttpError(400, "INVALID_BODY", "batch must be an array");
  }
  if (input.batch.length > MAX_BATCH_SIZE) {
    throw new HttpError(413, "BATCH_TOO_LARGE", `batch must not exceed ${MAX_BATCH_SIZE} items`);
  }

  const batch = input.batch.map((candidate, index) => {
    if (!isRecord(candidate)) throw new HttpError(400, "INVALID_BODY", `batch item ${index + 1} must be an object`);
    const mutationId = typeof candidate.mutation_id === "string" && candidate.mutation_id.trim() ? candidate.mutation_id : candidate.client_id;
    if (typeof candidate.client_id !== "string" || !candidate.client_id.trim() || typeof mutationId !== "string" || !mutationId.trim()) throw new HttpError(400, "INVALID_BODY", `batch item ${index + 1} is missing mutation identity`);
    if (!isSyncEntityType(candidate.type)) throw new HttpError(400, "INVALID_BODY", `batch item ${index + 1} has an unsupported entity type`);
    if (!isRecord(candidate.payload)) throw new HttpError(400, "INVALID_BODY", `batch item ${index + 1} payload must be an object`);
    if (typeof candidate.created_at_local !== "string" || !candidate.created_at_local) throw new HttpError(400, "INVALID_BODY", `batch item ${index + 1} is missing created_at_local`);
    const normalized: SyncBatchItem = {
      client_id: candidate.client_id,
      mutation_id: mutationId,
      idempotency_key: typeof candidate.idempotency_key === "string" && candidate.idempotency_key ? candidate.idempotency_key : mutationId,
      entity_id: typeof candidate.entity_id === "string" ? candidate.entity_id : undefined,
      operation: candidate.operation === "upsert" || candidate.operation === "append" ? candidate.operation as "upsert" | "append" : undefined,
      expected_version: typeof candidate.expected_version === "number" ? candidate.expected_version : undefined,
      type: candidate.type as SyncEntityType,
      payload: candidate.payload,
      created_at_local: candidate.created_at_local,
    };
    if (IMMUTABLE_EVENTS.has(normalized.type)) {
      const payloadClientId = payloadValue(normalized.payload, "clientId");
      // Historical fixtures used human-readable ids. Real immutable writes
      // use UUIDs; enforce the contract for production-shaped identifiers
      // while allowing old queued rows to reach SQL for classification.
      if (payloadClientId !== undefined && payloadClientId !== normalized.idempotency_key && isUuid(normalized.idempotency_key)) {
        throw new HttpError(400, "VALIDATION_ERROR", "Immutable event clientId must equal idempotency_key");
      }
    }
    if (normalized.type === "product" && (
      normalized.expected_version === undefined ||
      typeof (normalized.payload as Record<string, unknown>).version !== "number" ||
      (normalized.payload as Record<string, unknown>).version !== normalized.expected_version
    )) {
      throw new HttpError(400, "VALIDATION_ERROR", "Product mutations must include a matching expected version");
    }
    return normalized;
  });

  return { device_id: typeof input.device_id === "string" ? input.device_id : null, batch };
}

function payloadValue(payload: unknown, key: string): unknown {
  return isRecord(payload) ? payload[key] : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function entityId(payload: unknown, fallback: string): string | undefined {
  const id = payloadValue(payload, "id");
  if (typeof id === "string" && id) return id;
  const clientId = payloadValue(payload, "clientId");
  return typeof clientId === "string" && clientId ? clientId : fallback;
}

function branchId(payload: unknown): string | null {
  const value = payloadValue(payload, "branchId");
  return typeof value === "string" && value ? value : null;
}

function saleUsesCustomerCredit(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.payments)) return false;
  return payload.payments.some((payment) =>
    isRecord(payment) && payment.method === "credit" && typeof payment.amount === "number" && payment.amount > 0
  );
}

function dependencyNotReadyMessage(rawMessage: unknown): string {
  // The SQL functions deliberately use a stable, non-sensitive dependency
  // message. Preserve that detail for diagnostics instead of reducing every
  // missing prerequisite to the same opaque error. Anything outside the
  // allow-list remains generic so database internals are never exposed.
  if (typeof rawMessage === "string") {
    const match = /^Referenced (businesses|branches|categories|customers|products|suppliers) is not synced yet$/i.exec(rawMessage.trim());
    if (match) return `${match[0]}. The prerequisite must sync before this change can be applied.`;
  }
  return "A required related record is not available yet; the change will be retried.";
}

export function classifyRpcError(error: { code?: string; message?: string }): { code: string; message: string } {
  switch (error.code) {
    case "42501": return { code: "FORBIDDEN", message: "The account is not allowed to apply this change." };
    case "40001":
    case "40P01":
    case "55P03": return { code: "TEMPORARY_UNAVAILABLE", message: "The server is temporarily unavailable; the change will be retried." };
    case "23503": return { code: "DEPENDENCY_NOT_READY", message: dependencyNotReadyMessage(error.message) };
    case "22023":
    case "22P02":
    case "23502": return { code: "VALIDATION_ERROR", message: "The mutation payload is invalid." };
    case "23505": return { code: "DUPLICATE_MUTATION", message: "This mutation was already applied or conflicts with an existing record." };
    default: return { code: "APPLY_FAILED", message: "The server could not apply this mutation." };
  }
}

function isRetryableCode(code: string): boolean {
  return ["TEMPORARY_UNAVAILABLE", "DEPENDENCY_NOT_READY", "BUSINESS_UNAVAILABLE", "ACCOUNT_NOT_APPROVED", "RATE_LIMITED", "NETWORK_UNAVAILABLE"].includes(code);
}

function authorizeMutation(context: Awaited<ReturnType<typeof resolveAccountContext>>, item: SyncBatchItem): void {
  if (context.accountType === "WORKER") {
    requireCapability(context, WORKER_CAPABILITY_BY_ENTITY[item.type]);
    if (item.type === "sale" && saleUsesCustomerCredit(item.payload)) {
      requireCapability(context, "USE_CUSTOMER_CREDIT");
    }
  }
  const itemBranchId = branchId(item.payload);
  if (itemBranchId && item.type !== "product" && item.type !== "customer" && item.type !== "supplier" && item.type !== "credit_payment") {
    requireAssignedBranch(context, itemBranchId);
  }
}

export async function pushSyncBatch(db: SupabaseClient, actor: User, input: unknown) {
  const request = parseRequest(input);
  const context = await resolveAccountContext(db, actor);
  if (context.accountType === "ADMIN" || !context.businessId) throw new HttpError(403, "FORBIDDEN", "Platform administrators cannot sync tenant operations");

  if (request.device_id) {
    await db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", request.device_id).eq("user_id", actor.id);
  }

  const results: SyncResult[] = [];
  for (const item of request.batch) {
    const startedAt = Date.now();
    const id = item.entity_id ?? entityId(item.payload, item.client_id);
    try {
      authorizeMutation(context, item);
      const { data, error } = await db.rpc(RPC_BY_ENTITY[item.type], { payload: item.payload, actor_id: actor.id });
      if (error) {
        const classified = classifyRpcError(error);
        results.push({ clientId: item.client_id, mutationId: item.mutation_id, entityId: id, status: isRetryableCode(classified.code) ? "retryable_error" : "permanent_failure", error: classified });
        logger.warn("sync mutation rejected", {
          userId: actor.id,
          businessId: context.businessId,
          entityType: item.type,
          mutationId: item.client_id,
          resultCode: classified.code,
          rpcCode: error.code ?? null,
          rpcMessage: typeof error.message === "string" ? error.message.slice(0, 200) : null,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }
      const rpcResult = isRecord(data) ? data : {};
      const status = rpcResult.status === "conflict" || rpcResult.conflict === true ? "conflict" : rpcResult.status === "skipped" ? "skipped" : "applied";
      const authoritativeEntityId = typeof rpcResult.id === "string" ? rpcResult.id : undefined;
      results.push({
        clientId: item.client_id,
        mutationId: item.mutation_id,
        entityId: authoritativeEntityId ?? id,
        submittedEntityId: id,
        ...(authoritativeEntityId ? { authoritativeEntityId, canonicalized: authoritativeEntityId !== id } : {}),
        status,
        ...(typeof rpcResult.version === "number" ? { version: rpcResult.version } : {}),
        ...(typeof rpcResult.conflict === "boolean" ? { conflict: rpcResult.conflict } : {}),
        ...(status === "conflict" ? { error: { code: "VERSION_CONFLICT", message: "This record changed on another device." } } : {}),
      });
      logger.info("sync mutation applied", { userId: actor.id, businessId: context.businessId, entityType: item.type, mutationId: item.client_id, resultCode: status, durationMs: Date.now() - startedAt });
    } catch (error) {
      if (error instanceof HttpError) {
        results.push({ clientId: item.client_id, mutationId: item.mutation_id, entityId: id, status: isRetryableCode(error.code) ? "retryable_error" : "permanent_failure", error: { code: error.code, message: error.message } });
        continue;
      }
      logger.error("sync mutation failed", { userId: actor.id, businessId: context.businessId, entityType: item.type, mutationId: item.client_id, durationMs: Date.now() - startedAt }, error);
      results.push({ clientId: item.client_id, mutationId: item.mutation_id, entityId: id, status: "retryable_error", error: { code: "TEMPORARY_UNAVAILABLE", message: "The server could not complete this mutation; it will be retried." } });
    }
  }
  return { ok: true, results };
}
