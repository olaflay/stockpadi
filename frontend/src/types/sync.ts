import { SYNC_ENTITY_TYPES, type SyncEntityType, type SyncPushResponse as ContractSyncPushResponse, type SyncPullResponse as ContractSyncPullResponse } from "@stockpadi/contracts";
export { SYNC_ENTITY_TYPES };
export type { SyncEntityType };
export type SyncPushResponse = ContractSyncPushResponse;
export type SyncPullResponse = ContractSyncPullResponse;

/**
 * These are the only user-facing lifecycle states.  A stock event can remain
 * `syncing` after its upload is acknowledged while we wait to confirm the
 * authoritative branch projection; `awaitingConfirmation` carries that
 * internal detail without inventing a fifth visible state.
 */
export type SyncItemStatus = "pending" | "syncing" | "blocked" | "failed" | "conflict";

export interface SyncQueueItem<TPayload = unknown> {
  clientId: string;
  /** New canonical mutation identity. clientId remains a legacy Dexie key. */
  mutationId?: string;
  /** Stable server idempotency key; immutable events never coalesce this key. */
  idempotencyKey?: string;
  businessId?: string;
  type: SyncEntityType;
  operation?: "upsert" | "append";
  payload: TPayload;
  expectedVersion?: number;
  createdAtLocal: string;
  status: SyncItemStatus;
  attemptCount: number;
  lastError: string | null;
  errorCode?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  nextAttemptAt?: string | null;
  lastAttemptAt?: string | null;
  /** Upload succeeded; keep its local ledger delta until a pull confirms it. */
  awaitingConfirmation?: boolean;
  /** Durable ordering key. Older rows without one fall back to createdAtLocal. */
  sequence?: number;
  /** Entity-level identity is separate from the idempotency/event key. */
  entityId?: string;
  /** An item is not eligible until these outbox entity/event keys are gone. */
  dependsOn?: string[];
  dependsOnMutationIds?: string[];
}

export interface SyncPushRequest {
  deviceId: string;
  batch: Array<{
    clientId: string;
    mutationId?: string;
    idempotencyKey?: string;
    entityId?: string;
    type: SyncEntityType;
    operation?: "upsert" | "append";
    payload: unknown;
    createdAtLocal: string;
  }>;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
