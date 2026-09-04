import { db } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import type { SyncQueueItem } from "@/types/sync";
import { matchesActiveTenant } from "@/lib/local-tenant";

/**
 * Pushes every pending outbox item to the sync-push Edge Function in
 * FIFO order, in batches of at most DRAIN_BATCH_SIZE, and reconciles each
 * batch's result back into IndexedDB. See
 * .agents/skills/write-edge-function.md and PRD 10.1.
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
  status: "applied" | "skipped" | "error";
  conflict?: boolean;
  error?: { code: string; message: string };
}

// Keep a single sync-push call under the server's MAX_BATCH_SIZE
// (sync-push/index.ts). A device that goes offline for a long stretch can
// queue far more than one drain's worth; sending it all in one call would
// 413. The last slice is always a partial, so a drain that is already under
// the cap stays a single call.
const DRAIN_BATCH_SIZE = 500;

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
  const getPendingCount = async () =>
    (await db.outbox.where("status").anyOf("pending", "syncing").toArray()).filter(matchesActiveTenant).length;

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
  const supabase = getSupabase();
  if (!supabase) return;

  const pending = (await db.outbox.where("status").equals("pending").sortBy("createdAtLocal"))
    .filter(matchesActiveTenant);
  if (pending.length === 0) return;

  for (let offset = 0; offset < pending.length; offset += DRAIN_BATCH_SIZE) {
    const slice = pending.slice(offset, offset + DRAIN_BATCH_SIZE);
    await drainSlice(slice, supabase);
  }
}

async function drainSlice(slice: SyncQueueItem[], supabase: ReturnType<typeof getSupabase>): Promise<void> {
  if (!supabase) return;

  let {
    data: { session },
  } = await supabase.auth.getSession();

  // If token is near expiration or missing, attempt refresh if client supports it
  if (
    session &&
    session.expires_at &&
    session.expires_at * 1000 < Date.now() + 60000 &&
    typeof supabase.auth.refreshSession === "function"
  ) {
    try {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session) {
        session = refreshed.data.session;
      }
    } catch {
      // Continue with existing session or let network call authenticate
    }
  }

  if (!session) return;

  await db.outbox.bulkUpdate(
    slice.map((item) => ({ key: item.clientId, changes: { status: "syncing" as const } }))
  );

  let results: SyncPushItemResult[];
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        device_id: null,
        batch: slice.map((item) => ({
          client_id: item.clientId,
          type: item.type,
          payload: item.payload,
          created_at_local: item.createdAtLocal,
        })),
      }),
    });

    if (!response.ok) {
      await revertToPending(slice, `sync-push responded ${response.status}`);
      return;
    }

    ({ results } = await response.json());
  } catch (err) {
    // Network failure (including the case Background Sync will retry the
    // underlying fetch itself, see src/app/sw.ts): leave these items
    // retryable rather than marking them failed, a dropped connection is
    // not a rejection.
    await revertToPending(slice, err instanceof Error ? err.message : "Network error during sync");
    return;
  }

  const resultByClientId = new Map(results.map((result) => [result.clientId, result]));
  const toDelete: string[] = [];
  const toMarkFailed: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];
  const toRequeue: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];

  for (const item of slice) {
    const result = resultByClientId.get(item.clientId);
    if (result?.status === "applied" || result?.status === "skipped") {
      toDelete.push(item.clientId);
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
        },
      });
      continue;
    }
    toMarkFailed.push({
      key: item.clientId,
      changes: {
        status: "failed",
        attemptCount: item.attemptCount + 1,
        lastError: result.error?.message ?? "Sync rejected by server",
      },
    });
  }

  if (toDelete.length > 0) await db.outbox.bulkDelete(toDelete);
  if (toMarkFailed.length > 0) await db.outbox.bulkUpdate(toMarkFailed);
  if (toRequeue.length > 0) await db.outbox.bulkUpdate(toRequeue);
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
  const stuck = (await db.outbox.where("status").equals("syncing").toArray()).filter(matchesActiveTenant);
  if (stuck.length === 0) return;
  await db.outbox.bulkUpdate(
    stuck.map((item) => ({ key: item.clientId, changes: { status: "pending" as const } }))
  );
}

/**
 * Auto-recover items stuck in "syncing" for longer than 30 seconds.
 * Prevents permanent lockout after a crash, tab kill, or network timeout.
 */
export async function recoverStaleSyncingItems(maxAgeMs = 30000): Promise<void> {
  const threshold = new Date(Date.now() - maxAgeMs).toISOString();
  const stale = (await db.outbox.where("status").equals("syncing").toArray())
    .filter((item) => matchesActiveTenant(item) && item.createdAtLocal < threshold);
  if (stale.length === 0) return;
  await db.outbox.bulkUpdate(
    stale.map((item) => ({ key: item.clientId, changes: { status: "pending" as const } }))
  );
}

async function revertToPending(items: SyncQueueItem[], message: string): Promise<void> {
  await db.outbox.bulkUpdate(
    items.map((item) => ({
      key: item.clientId,
      changes: {
        status: "pending" as const,
        attemptCount: item.attemptCount + 1,
        lastError: message,
      },
    }))
  );
}

/** Retries outbox items already marked failed, e.g. from a manual "retry" tap. */
export async function retryFailedOutboxItems(): Promise<void> {
  const failed = (await db.outbox.where("status").equals("failed").toArray()).filter(matchesActiveTenant);
  if (failed.length === 0) return;
  await db.outbox.bulkUpdate(
    failed.map((item) => ({ key: item.clientId, changes: { status: "pending" as const } }))
  );
  await drainOutbox();
}
