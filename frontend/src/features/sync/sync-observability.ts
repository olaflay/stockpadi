import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";

export type CoordinatorState = "idle" | "syncing" | "uploading" | "downloading";

export interface SyncCounters {
  triggerCount: number;
  realtimeHintCount: number;
  realtimeReconnectCount: number;
  coalescedTriggerCount: number;
  skippedPullCount: number;
  retryCount: number;
  lastBackoffDurationMs: number | null;
}

interface RuntimeTelemetry {
  sessionId: string | null;
  trigger: string | null;
  phase: CoordinatorState;
  startedAt: string | null;
  batchId: string | null;
  batchStartedAt: number | null;
  operationType: string | null;
  queueAgeMs: number | null;
}

const runtime: RuntimeTelemetry = {
  sessionId: null,
  trigger: null,
  phase: "idle",
  startedAt: null,
  batchId: null,
  batchStartedAt: null,
  operationType: null,
  queueAgeMs: null,
};

const counters: SyncCounters = {
  triggerCount: 0,
  realtimeHintCount: 0,
  realtimeReconnectCount: 0,
  coalescedTriggerCount: 0,
  skippedPullCount: 0,
  retryCount: 0,
  lastBackoffDurationMs: null,
};

function id(prefix: string): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function beginSyncSession(trigger: string): string {
  counters.triggerCount += 1;
  runtime.sessionId = id("sync");
  runtime.trigger = trigger;
  runtime.phase = "syncing";
  runtime.startedAt = new Date().toISOString();
  runtime.batchId = null;
  runtime.batchStartedAt = null;
  runtime.operationType = null;
  runtime.queueAgeMs = null;
  return runtime.sessionId;
}

export function recordRealtimeHint(): void {
  counters.realtimeHintCount += 1;
}

export function recordRealtimeReconnect(): void {
  counters.realtimeReconnectCount += 1;
}

export function recordCoalescedTrigger(): void {
  counters.coalescedTriggerCount += 1;
}

export function recordSkippedPull(): void {
  counters.skippedPullCount += 1;
}

export function recordRetry(backoffDurationMs: number): void {
  counters.retryCount += 1;
  counters.lastBackoffDurationMs = backoffDurationMs;
}

export function getSyncCounters(): SyncCounters {
  return { ...counters };
}

export function setCoordinatorPhase(phase: CoordinatorState): void {
  runtime.phase = phase;
}

export function beginSyncBatch(items: Array<{ createdAtLocal: string; type: string }>): string {
  runtime.batchId = id("batch");
  runtime.batchStartedAt = Date.now();
  runtime.operationType = items[0]?.type ?? null;
  const oldest = items.map((item) => Date.parse(item.createdAtLocal)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  runtime.queueAgeMs = oldest === undefined ? null : Math.max(0, Date.now() - oldest);
  return runtime.batchId;
}

export function getSyncObservability(): RuntimeTelemetry {
  return { ...runtime };
}

/** Safe support snapshot; it intentionally excludes payloads and credentials. */
export async function getSyncDebugSnapshot() {
  const businessId = await getLocalBusinessId();
  const rows = businessId
    ? (await db.outbox.toArray()).filter((row) => row.businessId === businessId && ["pending", "syncing", "blocked", "failed", "conflict", "needs_review"].includes(row.status))
    : [];
  rows.sort((a, b) => a.createdAtLocal.localeCompare(b.createdAtLocal) || a.clientId.localeCompare(b.clientId));
  const state = businessId ? await db.syncPullState.get(`${businessId}:session`) : undefined;
  const oldest = rows[0];
  return {
    businessId,
    coordinator: getSyncObservability(),
    pendingCount: rows.length,
    oldestPending: oldest
      ? {
          operationId: oldest.mutationId ?? oldest.clientId,
          type: oldest.type,
          status: oldest.status,
          attemptCount: oldest.attemptCount ?? 0,
          createdAtLocal: oldest.createdAtLocal,
          lastErrorCode: oldest.lastErrorCode ?? oldest.errorCode ?? null,
          lastErrorMessage: oldest.lastErrorMessage ?? oldest.lastError ?? null,
          nextAttemptAt: oldest.nextAttemptAt ?? null,
        }
      : null,
    lastServerResponse: state
      ? {
          status: state.lastPushStatus ?? null,
          errorCode: state.lastPushErrorCode ?? null,
          httpStatus: state.lastPushHttpStatus ?? null,
          acknowledgedCount: state.lastAcknowledgedCount ?? 0,
          lastAttemptAt: state.lastPushAttemptAt ?? null,
        }
      : null,
    cursor: state?.cursor ?? null,
    lastSuccessfulSyncAt: state?.lastCompletePullAt ?? null,
    counters: getSyncCounters(),
  };
}
