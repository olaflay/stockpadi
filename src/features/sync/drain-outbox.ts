import { db } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import type { SyncQueueItem } from "@/types/sync";

/**
 * Pushes every pending outbox item to the sync-push Edge Function in one
 * batch, FIFO order, and reconciles the result back into IndexedDB. See
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
export async function drainOutbox(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request("stockpadi-outbox-drain", { ifAvailable: true }, async (lock) => {
      if (!lock) return; // another tab already holds the lock
      await drainOnce();
    });
    return;
  }

  if (isDraining) return;
  isDraining = true;
  try {
    await drainOnce();
  } finally {
    isDraining = false;
  }
}

async function drainOnce(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const pending = await db.outbox.where("status").equals("pending").sortBy("createdAtLocal");
  if (pending.length === 0) return;

  await db.outbox.bulkUpdate(
    pending.map((item) => ({ key: item.clientId, changes: { status: "syncing" as const } }))
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
        batch: pending.map((item) => ({
          client_id: item.clientId,
          type: item.type,
          payload: item.payload,
          created_at_local: item.createdAtLocal,
        })),
      }),
    });

    if (!response.ok) {
      await revertToPending(pending, `sync-push responded ${response.status}`);
      return;
    }

    ({ results } = await response.json());
  } catch (err) {
    // Network failure (including the case Background Sync will retry the
    // underlying fetch itself, see src/app/sw.ts): leave these items
    // retryable rather than marking them failed, a dropped connection is
    // not a rejection.
    await revertToPending(pending, err instanceof Error ? err.message : "Network error during sync");
    return;
  }

  const resultByClientId = new Map(results.map((result) => [result.clientId, result]));
  const toDelete: string[] = [];
  const toMarkFailed: Array<{ key: string; changes: Partial<SyncQueueItem> }> = [];

  for (const item of pending) {
    const result = resultByClientId.get(item.clientId);
    if (!result || result.status === "applied" || result.status === "skipped") {
      toDelete.push(item.clientId);
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
  const failed = await db.outbox.where("status").equals("failed").toArray();
  if (failed.length === 0) return;
  await db.outbox.bulkUpdate(
    failed.map((item) => ({ key: item.clientId, changes: { status: "pending" as const } }))
  );
  await drainOutbox();
}
