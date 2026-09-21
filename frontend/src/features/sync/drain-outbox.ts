import { db } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import { BackendRequestError, NetworkUnavailableError, serverPost } from "@/features/operations/server-client";
import type { SyncQueueItem } from "@/types/sync";
import { matchesActiveTenant, getLocalBusinessId } from "@/lib/local-tenant";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";

/**
 * Pushes every pending outbox item to the Node sync API in deterministic
 * dependency/sequence order, in batches of at most DRAIN_BATCH_SIZE, and
 * reconciles each batch's result back into IndexedDB. See PRD 10.1.
 *
 * No-ops if there is no signed-in Supabase session: auth screens haven't
 * landed yet (see src/features/auth/use-current-user.ts), so there is no
 * token to authenticate a push with. Items stay queued in the outbox
 * exactly as they do today; nothing is lost, this function simply has
 * nothing it can safely do until a real session exists. Swapping this to
 * fire for real is then a call-site-free change, drainOutbox() itself
 * already does the right thing the moment supabase.auth has a session.
 */

interface SyncPushItemResult {
  clientId: string;
  mutationId?: string;
  entityId?: string;
  submittedEntityId?: string;
  authoritativeEntityId?: string;
  canonicalized?: boolean;
  status: "applied" | "skipped" | "conflict" | "error" | "retryable_error" | "permanent_failure";
  version?: number;
  conflict?: boolean;
  error?: { code: string; message: string };
}

// Keep a single sync-push call under the server's MAX_BATCH_SIZE
// (sync-push/index.ts). A device that goes offline for a long stretch can
// queue far more than one drain's worth; sending it all in one call would
// 413. The last slice is always a partial, so a drain that is already under
// the cap stays a single call.
const DRAIN_BATCH_SIZE = 500;
const STOCK_AFFECTING_TYPES = new Set(["sale", "stock_adjustment", "stock_count_submission", "purchase_receipt"]);

let isDraining = false;

/**
 * Web Locks API coordinates this across browser tabs on the same origin —
 * the plain in-memory isDraining flag below only prevented two concurrent
 * calls within a single tab. Without cross-tab coordination, two tabs open
 * at once could both drain the same pending rows; the loser's insert hits a
 * unique-constraint error server-side and gets marked "failed" locally even
 * though the data synced successfully via the winner (self-heals on manual
 * retry, but confusing). Falls back to the in-memory-only guard on browsers
 * without navigator.locks (Safari < 15.4).
 */
export async function drainOutbox(): Promise<{ drained: number; pendingRemaining: number }> {
  await getLocalBusinessId();

  const getPendingCount = async () =>
    (await db.outbox.where("status").anyOf("pending", "blocked").toArray()).filter(matchesActiveTenant).length;

  const initialCount = await getPendingCount();
  if (initialCount === 0) return { drained: 0, pendingRemaining: 0 };

  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request("stockpadi-outbox-drain", { ifAvailable: true }, async (lock) => {
      if (!lock) return; // another tab already holds the lock
      await drainOnce();
    });
    const finalCount = await getPendingCount();
    return { drained: Math.max(0, initialCount - finalCount), pendingRemaining: finalCount };
  }

  if (isDraining) return { drained: 0, pendingRemaining: initialCount };
  isDraining = true;
  try {
    await drainOnce();
  } finally {
    isDraining = false;
  }

  const finalCount = await getPendingCount();
  return { drained: Math.max(0, initialCount - finalCount), pendingRemaining: finalCount };
}

async function drainOnce(): Promise<void> {
  await getLocalBusinessId();
  await refreshActiveAccountContext();
  await resumeAccountBlockedWrites();
  const restoredCategoryIds = new Set<string>();

  for (;;) {
    let queued = (await db.outbox.where("status").anyOf("pending", "blocked").toArray()).filter(matchesActiveTenant);
    if (queued.length === 0) return;

    // Older product mutations can outlive their category mutation (for
    // example after a crash, an interrupted import, or local outbox repair).
    // The server must reject a product that references a category it has not
    // received yet, but the client can safely restore that dependency from
    // the same tenant's local category row. Never invent a category or use a
    // row from another business.
    await restoreMissingProductCategoryDependencies(queued, restoredCategoryIds);
    await linkQueuedProductCategoryDependencies(queued);
    queued = (await db.outbox.where("status").anyOf("pending", "blocked").toArray()).filter(matchesActiveTenant);
    const allActive = (await db.outbox.toArray()).filter(matchesActiveTenant);

    const ready: SyncQueueItem[] = [];
    const byDependency = new Map<string, SyncQueueItem[]>();
    for (const item of queued) {
      if (item.nextAttemptAt && item.nextAttemptAt > new Date().toISOString()) continue;
      let waiting = false;
      let failedDependency = false;
      for (const dependency of item.dependsOn ?? []) {
        const rows = allActive.filter((candidate) => candidate.clientId !== item.clientId && (candidate.clientId === dependency || candidate.entityId === dependency));
        const dependencyRow = rows[0];
        if (!dependencyRow) continue;
        if (dependencyRow.status === "failed" || dependencyRow.status === "conflict") failedDependency = true;
        else waiting = true;
      }
      if (failedDependency) {
        byDependency.set(item.clientId, [item]);
        continue;
      }
      if (!waiting) ready.push(item);
    }

    if (byDependency.size > 0) {
      await db.outbox.bulkUpdate([...byDependency.values()].flat().map((item) => ({
        key: item.clientId,
        changes: {
           status: "blocked" as const,
           errorCode: "DEPENDENCY_FAILED",
           lastError: "A prerequisite change could not be synced.",
           lastErrorCode: "DEPENDENCY_FAILED",
           lastErrorMessage: "A prerequisite change could not be synced.",
        },
      })));
    }
    if (ready.length === 0) return;

    ready.sort((a, b) => {
      const priority = (item: SyncQueueItem) => item.type === "product" ? 0 : 1;
      return priority(a) - priority(b) || (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.createdAtLocal.localeCompare(b.createdAtLocal) || a.clientId.localeCompare(b.clientId);
    });
    const progressed = await drainSlice(ready.slice(0, DRAIN_BATCH_SIZE));
    if (!progressed) return;
  }
}

/**
 * A product is sorted before other mutations so catalogue rows reach the
 * server before stock movements. Categories are a product prerequisite,
 * however, and must be the exception to that priority rule. Add the
 * dependency while both mutations are still local so a batch can never send
 * the product ahead of its queued category and trigger a foreign-key retry.
 */
async function linkQueuedProductCategoryDependencies(items: SyncQueueItem[]): Promise<void> {
  const categoryIdsByBusiness = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.type !== "category" || typeof item.businessId !== "string") continue;
    const id = item.entityId ?? (isRecord(item.payload) && typeof item.payload.id === "string" ? item.payload.id : item.clientId);
    if (!id) continue;
    const ids = categoryIdsByBusiness.get(item.businessId) ?? new Set<string>();
    ids.add(id);
    ids.add(item.clientId);
    if (item.mutationId) ids.add(item.mutationId);
    categoryIdsByBusiness.set(item.businessId, ids);
  }

  const updates: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];
  for (const item of items) {
    if (item.type !== "product" || typeof item.businessId !== "string" || !isRecord(item.payload)) continue;
    const categoryId = item.payload.categoryId;
    if (typeof categoryId !== "string") continue;
    const categoryIds = categoryIdsByBusiness.get(item.businessId);
    if (!categoryIds?.has(categoryId)) continue;
    if ((item.dependsOn ?? []).includes(categoryId)) continue;
    const dependsOn = [...(item.dependsOn ?? []), categoryId];
    updates.push({
      key: item.clientId,
      changes: { dependsOn, dependsOnMutationIds: [...(item.dependsOnMutationIds ?? []), categoryId] },
    });
  }
  if (updates.length > 0) await db.outbox.bulkUpdate(updates);
}

async function restoreMissingProductCategoryDependencies(items: SyncQueueItem[], restoredCategoryIds: Set<string>): Promise<void> {
  const activeOutbox = (await db.outbox.toArray()).filter(matchesActiveTenant);
  const queuedCategoryIds = new Set(
    activeOutbox
      .filter((item) => item.type === "category")
      .flatMap((item) => [item.clientId, item.mutationId, item.entityId].filter((id): id is string => Boolean(id)))
  );

  for (const item of items) {
    if (item.type !== "product" || !isRecord(item.payload)) continue;
    if (item.errorCode !== "DEPENDENCY_NOT_READY" && item.lastErrorCode !== "DEPENDENCY_NOT_READY") continue;
    const categoryId = item.payload.categoryId;
    if (typeof categoryId !== "string" || !categoryId) continue;

    const category = await db.categories.get(categoryId);
    if (!category || category.businessId !== item.businessId || queuedCategoryIds.has(categoryId) || restoredCategoryIds.has(categoryId)) continue;

    await enqueueOutboxWrite(category.id, "category", category, new Date().toISOString(), { entityId: category.id });
    queuedCategoryIds.add(category.id);
    restoredCategoryIds.add(category.id);

    if (!(item.dependsOn ?? []).includes(categoryId)) {
      await db.outbox.update(item.clientId, {
        dependsOn: [...(item.dependsOn ?? []), categoryId],
        dependsOnMutationIds: [...(item.dependsOnMutationIds ?? []), categoryId],
      });
    }
  }
}

/**
 * Refresh the local account mirror before sync. Worker capabilities and branch
 * assignments are owner-managed server state, so leaving them frozen at the
 * last login can make the server pull products successfully while the worker
 * UI still hides Products (or keeps showing access that was revoked).
 *
 * This is presentation/cache state only. Every backend read and write still
 * authorizes from the live access token and server-side account context.
 */
export async function refreshActiveAccountContext(): Promise<boolean> {
  const sessionRow = await db.session.get("current");
  if (!sessionRow?.userId) return false;
  const localUser = await db.localUsers.get(sessionRow.userId);
  if (!localUser) return false;
  try {
    const context = await serverPost<{
      accountType?: "ADMIN" | "BUSINESS_OWNER" | "WORKER";
      businessId?: string;
      businessStatus?: string;
      permissions?: string[];
      branchIds?: string[];
      profile?: { email_verified?: boolean; is_active?: boolean };
    }>("/api/account-context", {});
    await db.localUsers.update(sessionRow.userId, {
      ...(context.accountType ? { accountType: context.accountType } : {}),
      ...(context.businessId !== undefined ? { businessId: context.businessId } : {}),
      ...(context.businessStatus ? { businessStatus: context.businessStatus } : {}),
      ...(context.permissions ? { permissions: context.permissions } : {}),
      ...(context.branchIds ? { branchIds: context.branchIds } : {}),
      ...(context.profile?.email_verified !== undefined ? { emailVerified: context.profile.email_verified } : {}),
      ...(context.profile?.is_active !== undefined ? { isActive: context.profile.is_active } : {}),
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    // A disconnected or temporarily unavailable account refresh must not stop
    // the durable local sync loop. The next interval retries the probe.
    if (error instanceof BackendRequestError || error instanceof NetworkUnavailableError) return false;
    return false;
  }
}

async function resumeAccountBlockedWrites(): Promise<void> {
  const sessionRow = await db.session.get("current");
  if (!sessionRow?.userId) return;
  const localUser = await db.localUsers.get(sessionRow.userId);
  if (!localUser || localUser.accountType !== "BUSINESS_OWNER" || !["verified", "active"].includes(localUser.businessStatus ?? "")) return;
  const blocked = (await db.outbox.where("status").equals("blocked").toArray())
    .filter((item) => matchesActiveTenant(item) && ["ACCOUNT_NOT_APPROVED", "BUSINESS_UNAVAILABLE"].includes(item.errorCode ?? ""));
  if (blocked.length === 0) return;
  await db.outbox.bulkUpdate(blocked.map((item) => ({
    key: item.clientId,
    changes: { status: "pending" as const, errorCode: null, lastError: null, lastErrorCode: null, lastErrorMessage: null, nextAttemptAt: null },
  })));
}

async function drainSlice(slice: SyncQueueItem[]): Promise<boolean> {
  // Auth SDK access is intentionally the only Supabase SDK use here. The
  // business request itself goes through the Node application API.
  const supabase = getSupabase();
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  const sessionRow = await db.session.get("current");
  if (sessionRow?.userId) {
    const localUser = await db.localUsers.get(sessionRow.userId);
    if (
      localUser &&
      localUser.accountType === "BUSINESS_OWNER" &&
      localUser.businessStatus &&
      localUser.businessStatus !== "verified" &&
      localUser.businessStatus !== "active"
    ) {
      await parkRetryable(slice, "BUSINESS_UNAVAILABLE", "Account pending verification. Products and data will sync once approved by admin.", true);
      return false;
    }
  }

  await db.outbox.bulkUpdate(
    slice.map((item) => ({ key: item.clientId, changes: { status: "syncing" as const, lastAttemptAt: new Date().toISOString() } }))
  );

  let results: SyncPushItemResult[];
  try {
    const response = await serverPost<{ results: SyncPushItemResult[] }>("/api/sync/push", {
        device_id: null,
        batch: slice.map((item) => ({
          client_id: item.mutationId ?? item.clientId,
          mutation_id: item.mutationId ?? item.clientId,
          idempotency_key: item.idempotencyKey ?? item.clientId,
          entity_id: item.entityId ?? item.clientId,
          operation: item.operation ?? (["product", "customer", "supplier", "branch", "category"].includes(item.type) ? "upsert" : "append"),
          expected_version: item.expectedVersion,
          type: item.type,
          payload: item.payload,
          created_at_local: item.createdAtLocal,
        })),
    });
    ({ results } = response);
  } catch (err) {
    // Network failure (including the case Background Sync will retry the
    // underlying fetch itself, see src/app/sw.ts): leave these items
    // retryable rather than marking them failed, a dropped connection is
    // not a rejection.
    if (err instanceof BackendRequestError) {
      const retryable = err.status >= 500 || err.status === 429 || [
        "BUSINESS_UNAVAILABLE", "ACCOUNT_NOT_APPROVED", "DEPENDENCY_NOT_READY", "TEMPORARY_UNAVAILABLE", "RATE_LIMITED", "NETWORK_UNAVAILABLE",
      ].includes(err.code);
      if (retryable) await parkRetryable(slice, err.code, err.message, ["BUSINESS_UNAVAILABLE", "ACCOUNT_NOT_APPROVED", "DEPENDENCY_NOT_READY"].includes(err.code));
      else await markPermanentFailure(slice, err.code, err.message);
      await recordPushOutcome(slice, false, err.code, err.status);
    } else {
      await revertToPending(slice, err instanceof Error ? err.message : "Network error during sync");
      await recordPushOutcome(slice, false, "NETWORK_UNAVAILABLE", null);
    }
    return false;
  }

  const resultByClientId = new Map(results.flatMap((result) => [
    [result.clientId, result] as const,
    ...(result.mutationId ? [[result.mutationId, result] as const] : []),
  ]));
  const toDelete: string[] = [];
  const toConfirm: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];
  const toMarkFailed: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];
  const toRequeue: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];

  for (const item of slice) {
    const result = resultByClientId.get(item.clientId);
    if (result?.status === "applied" || result?.status === "skipped") {
      if (result.canonicalized && result.authoritativeEntityId && result.authoritativeEntityId !== item.entityId) {
        await reconcileAuthoritativeIdentity(item, result.authoritativeEntityId);
      }
      if (STOCK_AFFECTING_TYPES.has(item.type)) {
        // A push acknowledgement proves the server accepted the ledger event,
        // but it does not prove this device has downloaded the resulting
        // product+branch projection. Keep the local delta authoritative until
        // a complete inventory pull confirms that exact key.
        toConfirm.push({
          key: item.clientId,
          changes: {
            // Keep this in the professional, familiar "syncing" state.
            // The explicit flag prevents the crash-recovery sweeper from
            // re-uploading an event that the server has already accepted.
            status: "syncing",
            awaitingConfirmation: true,
            errorCode: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            lastError: null,
            nextAttemptAt: null,
          },
        });
      } else {
        toDelete.push(item.clientId);
      }
      if (item.type === "product" && result.version !== undefined) {
        const productId = item.entityId ?? (item.payload as { id?: string }).id;
        if (productId) await db.products.update(productId, { version: result.version });
        const dependentProducts = (await db.outbox.toArray()).filter((candidate) =>
          candidate.type === "product" &&
          (candidate.dependsOn ?? []).some((dependency) => dependency === item.clientId || dependency === item.mutationId || dependency === productId)
        );
        for (const dependent of dependentProducts) {
          const payload = dependent.payload as Record<string, unknown>;
          await db.outbox.update(dependent.clientId, {
            expectedVersion: result.version,
            payload: { ...payload, version: result.version },
          });
        }
      }
      continue;
    }
    if (result?.status === "conflict" || result?.conflict) {
      toMarkFailed.push({
        key: item.clientId,
        changes: {
          status: "conflict",
          errorCode: result.error?.code ?? "PRODUCT_CONFLICT",
          lastErrorCode: result.error?.code ?? "PRODUCT_CONFLICT",
          lastErrorMessage: result.error?.message ?? "This product changed on another device. Review it before retrying.",
          attemptCount: item.attemptCount + 1,
          lastError: result.error?.message ?? "This product changed on another device. Review it before retrying.",
        },
      });
      continue;
    }
    if (!result) {
      // The server gave us a valid response but no entry for this item — we
      // genuinely don't know whether it applied. Treating that as "done" and
      // deleting the row would be at-most-once, silently dropping a sale or
      // movement the server may never have recorded. Keep it retryable and
      // let the next drain confirm, rather than assume success.
      toRequeue.push({
        key: item.clientId,
        changes: {
          status: "pending" as const,
          attemptCount: item.attemptCount + 1,
          lastError: "No per-item result returned by sync-push; will retry to confirm",
          lastErrorCode: "MISSING_RESULT",
          lastErrorMessage: "No per-item result returned by sync-push; will retry to confirm",
          nextAttemptAt: nextAttemptAt(item.attemptCount),
        },
      });
      continue;
    }
    const code = result.error?.code ?? (result.status === "retryable_error" ? "TEMPORARY_UNAVAILABLE" : "SYNC_REJECTED");
    const message = result.error?.message ?? "Sync rejected by server";
    if (code === "BUSINESS_UNAVAILABLE" || code === "ACCOUNT_NOT_APPROVED" || code === "ACCOUNT_PENDING" || code === "DEPENDENCY_NOT_READY" || code === "TEMPORARY_UNAVAILABLE" || code === "RATE_LIMITED") {
      toRequeue.push({ key: item.clientId, changes: { status: "blocked", errorCode: code, lastErrorCode: code, lastErrorMessage: message, attemptCount: item.attemptCount + 1, lastError: message, nextAttemptAt: nextAttemptAt(item.attemptCount) } });
    } else if (code.startsWith("HTTP_5") || code === "NETWORK_UNAVAILABLE") {
      toRequeue.push({ key: item.clientId, changes: { status: "pending", errorCode: code, lastErrorCode: code, lastErrorMessage: message, attemptCount: item.attemptCount + 1, lastError: message, nextAttemptAt: nextAttemptAt(item.attemptCount) } });
    } else {
      toMarkFailed.push({ key: item.clientId, changes: { status: "failed", errorCode: code, lastErrorCode: code, lastErrorMessage: message, attemptCount: item.attemptCount + 1, lastError: message } });
    }
  }

  if (toDelete.length > 0) {
    await db.outbox.bulkDelete(toDelete);
  }
  if (toConfirm.length > 0) await db.outbox.bulkUpdate(toConfirm);
  if (toMarkFailed.length > 0) await db.outbox.bulkUpdate(toMarkFailed);
  if (toRequeue.length > 0) await db.outbox.bulkUpdate(toRequeue);
  const firstFailureItem = slice.find((item) => {
    const result = resultByClientId.get(item.clientId);
    return !result || !["applied", "skipped"].includes(result.status);
  });
  const firstFailure = firstFailureItem ? resultByClientId.get(firstFailureItem.clientId) : undefined;
  const accepted = toDelete.length > 0 || toConfirm.length > 0;
  await recordPushOutcome(
    slice,
    !firstFailureItem,
    firstFailure?.error?.code ?? (firstFailureItem ? "MISSING_RESULT" : null),
    null,
    accepted,
  );
  return true;
}

async function recordPushOutcome(
  items: SyncQueueItem[],
  success: boolean,
  errorCode: string | null,
  httpStatus: number | null,
  accepted = false,
): Promise<void> {
  const businessId = items.find((item) => item.businessId)?.businessId ?? await getLocalBusinessId();
  if (!businessId) return;
  const id = `${businessId}:session`;
  const attemptedAt = new Date().toISOString();
  const existing = await db.syncPullState.get(id);
  if (existing) {
    await db.syncPullState.update(id, {
      ...(accepted ? { lastSuccessfulPushAt: attemptedAt } : {}),
      lastPushStatus: success ? "success" : "failed",
      lastPushErrorCode: errorCode,
      lastPushHttpStatus: httpStatus,
      lastPushAttemptAt: attemptedAt,
    });
    return;
  }
  await db.syncPullState.put({
    id,
    businessId,
    cursor: null,
    startedAt: null,
    completedAt: null,
    pagesFetched: 0,
    entityCounts: {},
    partialErrors: [],
    lastCompletePullAt: null,
    lastSuccessfulPushAt: accepted ? attemptedAt : null,
    lastPullTrigger: null,
    lastInvalidationReceivedAt: null,
    lastServerContactAt: null,
    lastPushStatus: success ? "success" : "failed",
    lastPushErrorCode: errorCode,
    lastPushHttpStatus: httpStatus,
    lastPushAttemptAt: attemptedAt,
    lastPullStatus: null,
    lastPullErrorCode: null,
    lastPullHttpStatus: null,
    lastFailedDataset: null,
    pullRetryCount: 0,
    nextPullAttemptAt: null,
  });
}

/**
 * RPCs may canonicalize a local snapshot to an existing server entity. This
 * must happen before the dependent outbox row is eligible, otherwise a local
 * foreign-key reference can retry forever against an id the server will never
 * create.
 */
async function reconcileAuthoritativeIdentity(item: SyncQueueItem, authoritativeId: string): Promise<void> {
  const localId = item.entityId ?? (isRecord(item.payload) && typeof item.payload.id === "string" ? item.payload.id : undefined);
  if (!localId || localId === authoritativeId) return;

  if (item.type === "category") {
    const local = await db.categories.get(localId);
    await db.transaction("rw", db.categories, db.products, db.outbox, async () => {
      if (local && !(await db.categories.get(authoritativeId))) {
        await db.categories.put({ ...local, id: authoritativeId });
      }
      const products = await db.products.toArray();
      for (const product of products) {
        if (product.businessId === item.businessId && product.categoryId === localId) {
          await db.products.update(product.id, { categoryId: authoritativeId });
        }
      }
      const outbox = await db.outbox.toArray();
      for (const dependent of outbox) {
        if (dependent.businessId !== item.businessId) continue;
        const payload = isRecord(dependent.payload) ? dependent.payload : null;
        const changed = payload && payload.categoryId === localId ? { ...payload, categoryId: authoritativeId } : null;
        const dependencies = (dependent.dependsOn ?? []).map((dependency) => dependency === localId ? authoritativeId : dependency);
        if (changed || dependencies.length !== (dependent.dependsOn ?? []).length) {
          await db.outbox.update(dependent.clientId, { ...(changed ? { payload: changed } : {}), dependsOn: dependencies, dependsOnMutationIds: dependencies });
        }
      }
      await db.categories.delete(localId);
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Recovers outbox rows left in the "syncing" state by a crash or a tab killed
 * mid-drain. "syncing" is transient — marking a slice syncing before the
 * network call and reverting on failure means any interruption between the two
 * parks the row there forever, invisible to the pending filter and never
 * retried. This sweeper returns those rows to pending so the next drain picks
 * them up. Safe to call on every connect and on boot.
 */
export async function recoverStuckSyncingItems(): Promise<void> {
  const stuck = (await db.outbox.where("status").equals("syncing").toArray())
    .filter((item) => matchesActiveTenant(item) && !item.awaitingConfirmation);
  if (stuck.length === 0) return;
  await db.outbox.bulkUpdate(
    stuck.map((item) => ({ key: item.clientId, changes: { status: "pending" as const, nextAttemptAt: null } }))
  );
}

/**
 * Auto-recover items stuck in "syncing" for longer than 30 seconds.
 * Prevents permanent lockout after a crash, tab kill, or network timeout.
 */
export async function recoverStaleSyncingItems(maxAgeMs = 30000): Promise<void> {
  const threshold = new Date(Date.now() - maxAgeMs).toISOString();
  const stale = (await db.outbox.where("status").equals("syncing").toArray())
    .filter((item) => matchesActiveTenant(item) && !item.awaitingConfirmation && (item.lastAttemptAt ?? item.createdAtLocal) < threshold);
  if (stale.length === 0) return;
  await db.outbox.bulkUpdate(
    stale.map((item) => ({ key: item.clientId, changes: { status: "pending" as const } }))
  );
}

async function revertToPending(items: SyncQueueItem[], message: string): Promise<void> {
  await parkRetryable(items, "NETWORK_UNAVAILABLE", message);
}

function nextAttemptAt(attemptCount: number): string {
  const delayMs = Math.min(5 * 60 * 1000, 1000 * 2 ** Math.min(attemptCount, 8));
  return new Date(Date.now() + delayMs).toISOString();
}

async function parkRetryable(items: SyncQueueItem[], code: string, message: string, blocked = false): Promise<void> {
  await db.outbox.bulkUpdate(items.map((item) => ({
    key: item.clientId,
    changes: {
      status: blocked ? "blocked" : "pending",
      errorCode: code,
      lastErrorCode: code,
      lastErrorMessage: message,
      attemptCount: item.attemptCount + 1,
      lastError: message,
      nextAttemptAt: nextAttemptAt(item.attemptCount),
    },
  })));
}

async function markPermanentFailure(items: SyncQueueItem[], code: string, message: string): Promise<void> {
  await db.outbox.bulkUpdate(items.map((item) => ({ key: item.clientId, changes: { status: "failed" as const, errorCode: code, lastErrorCode: code, lastErrorMessage: message, attemptCount: item.attemptCount + 1, lastError: message } })));
}

/** Retries outbox items already marked failed, e.g. from a manual "retry" tap. */
export async function retryFailedOutboxItems(): Promise<void> {
  const failed = (await db.outbox.where("status").equals("failed").toArray()).filter(matchesActiveTenant);
  if (failed.length === 0) return;
  await db.outbox.bulkUpdate(
    failed.map((item) => ({ key: item.clientId, changes: { status: "pending" as const, errorCode: null, lastErrorCode: null, lastErrorMessage: null, nextAttemptAt: null, lastError: null } }))
  );
  await drainOutbox();
}
