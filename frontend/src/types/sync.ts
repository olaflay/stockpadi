/**
 * Shared shape for the outbox pattern and the sync-push Edge Function.
 * See .agents/rules/coding-standards-and-api.md and PRD Section 12.
 */

export const SYNC_ENTITY_TYPES = [
  "sale",
  "stock_adjustment",
  "purchase_receipt",
  "customer",
  "product",
  "credit_payment",
  "expense",
  "supplier",
] as const;

export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export type SyncItemStatus = "pending" | "syncing" | "failed" | "synced";

export interface SyncQueueItem<TPayload = unknown> {
  clientId: string;
  businessId?: string;
  type: SyncEntityType;
  payload: TPayload;
  createdAtLocal: string;
  status: SyncItemStatus;
  attemptCount: number;
  lastError: string | null;
}

export interface SyncPushRequest {
  deviceId: string;
  batch: Array<{
    clientId: string;
    type: SyncEntityType;
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
