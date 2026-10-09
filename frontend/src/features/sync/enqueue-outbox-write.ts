import { db } from "@/lib/db";
import type { SyncEntityType } from "@/types/sync";
import { getCachedLocalBusinessId, getLocalBusinessId } from "@/lib/local-tenant";
import { assertHighRiskWriteAllowed } from "@/features/sync/sync-safety";

const MUTABLE_ENTITY_TYPES: SyncEntityType[] = ["product", "customer", "supplier", "branch", "category"];

/** Background Sync wakes a client; it never owns mutation replay. */
function registerBackgroundSyncHint(): void {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  void navigator.serviceWorker.ready.then((registration) => {
    const withSync = registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    return withSync.sync?.register("stockpadi-sync");
  }).catch(() => undefined);
}

/**
 * Wake the canonical coordinator in the next microtask. This preserves a
 * single Dexie transaction for the local write while avoiding an artificial
 * polling/debounce delay before the durable outbox is pushed.
 */
function scheduleImmediateDrain(trigger: "local-write" | "sale"): void {
  queueMicrotask(() => {
    void import("@/features/sync/SyncCoordinator").then(({ triggerSync }) => {
      return triggerSync(trigger);
    }).catch(() => {
      // The durable outbox remains available for the next lifecycle, network,
      // Realtime, retry, or reconciliation trigger.
    });
  });
}

/**
 * The append-to-outbox half of every offline write — one queued row per
 * mutation, always called inside the same Dexie transaction as the data
 * write itself (must be, per .agents/rules/offline-sync-and-ledger.md).
 * Extracted since this exact shape was duplicated near-verbatim across
 * seven write-path files.
 *
 * If the device is online, an immediate coordinator drain is triggered so
 * pending items don't sit idle until the next app open or background sync
 * event.
 */
export async function enqueueOutboxWrite(
  clientId: string,
  type: SyncEntityType,
  payload: unknown,
  createdAtLocal: string,
  options: { dependsOn?: string[]; entityId?: string } = {}
): Promise<void> {
  const businessId = getCachedLocalBusinessId() ?? (await getLocalBusinessId());
  if (!businessId && !(typeof process !== "undefined" && process.env.NODE_ENV === "test")) {
    throw new Error("A signed-in business context is required before queueing a local change.");
  }
  await assertHighRiskWriteAllowed(type);
  const existing = await db.outbox.get(clientId);
  const lastSequence = (await db.outbox.orderBy("sequence").last())?.sequence ?? 0;
  const canonicalPayload = type === "product" && isRecord(payload)
    ? { ...payload, archived: typeof payload.archived === "boolean" ? payload.archived : false }
    : payload;
  const entityId = options.entityId ?? (isRecord(canonicalPayload) && typeof canonicalPayload.id === "string" ? canonicalPayload.id : clientId);
  const mutable = MUTABLE_ENTITY_TYPES.includes(type);
  const operation = mutable ? "upsert" as const : "append" as const;
  const expectedVersion = isRecord(canonicalPayload) && typeof canonicalPayload.version === "number" ? canonicalPayload.version : undefined;

  // Product edits are snapshots, not immutable ledger events. Coalescing a
  // still-pending product row prevents a duplicate-primary-key abort while
  // retaining the original client idempotency key for a product create.
  if (existing && MUTABLE_ENTITY_TYPES.includes(type) && existing.status !== "syncing") {
    await db.outbox.put({
      ...existing,
      businessId,
      mutationId: existing.mutationId ?? existing.clientId,
      idempotencyKey: existing.idempotencyKey ?? existing.clientId,
      payload: canonicalPayload,
      operation,
      expectedVersion,
      createdAtLocal,
      status: "pending",
      lastError: null,
      errorCode: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextAttemptAt: null,
      sequence: lastSequence + 1,
      entityId,
      dependsOn: options.dependsOn ?? existing.dependsOn,
      dependsOnMutationIds: options.dependsOn ?? existing.dependsOnMutationIds,
    });
  } else {
    const eventId = existing && existing.status === "syncing" ? `${clientId}:${crypto.randomUUID()}` : clientId;
    const dependencies = existing && existing.status === "syncing"
      ? [...new Set([...(options.dependsOn ?? []), existing.entityId ?? existing.mutationId ?? existing.clientId])]
      : options.dependsOn;
    await db.outbox.put({
      clientId: eventId,
      mutationId: eventId,
      idempotencyKey: eventId,
      businessId,
      type,
      operation,
      expectedVersion,
      payload: canonicalPayload,
      createdAtLocal,
      status: "pending",
      attemptCount: existing && existing.status === "syncing" ? 0 : existing?.attemptCount ?? 0,
      lastError: null,
      errorCode: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextAttemptAt: null,
      sequence: lastSequence + 1,
      entityId,
      dependsOn: dependencies,
      dependsOnMutationIds: dependencies,
    });
  }

  // Trigger one immediate canonical drain after every local write. The online
  // flag is only a hint and can remain stale on weak mobile networks; the
  // request layer classifies a failed attempt and parks it with backoff.
  scheduleImmediateDrain(type === "sale" ? "sale" : "local-write");
  registerBackgroundSyncHint();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
