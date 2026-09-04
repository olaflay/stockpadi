import { db } from "@/lib/db";
import type { SyncEntityType } from "@/types/sync";
import { getCachedLocalBusinessId, getLocalBusinessId } from "@/lib/local-tenant";

let drainTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced drain trigger: when an outbox row is written while online,
 * schedule a drain in 1s so rapid writes batch into one network call.
 */
function scheduleDebouncedDrain(): void {
  if (drainTimer) clearTimeout(drainTimer);
  drainTimer = setTimeout(async () => {
    drainTimer = null;
    try {
      const { drainOutbox } = await import("@/features/sync/drain-outbox");
      await drainOutbox();
    } catch {
      // drain will be retried on next trigger or manual sync
    }
  }, 1000);
}

/**
 * The append-to-outbox half of every offline write — one queued row per
 * mutation, always called inside the same Dexie transaction as the data
 * write itself (must be, per .agents/rules/offline-sync-and-ledger.md).
 * Extracted since this exact shape was duplicated near-verbatim across
 * seven write-path files.
 *
 * If the device is online, a debounced drain is triggered immediately
 * so pending items don't sit idle until the next app open or background
 * sync event.
 */
export async function enqueueOutboxWrite(
  clientId: string,
  type: SyncEntityType,
  payload: unknown,
  createdAtLocal: string
): Promise<void> {
  const businessId = getCachedLocalBusinessId() ?? (await getLocalBusinessId());
  await db.outbox.add({
    clientId,
    businessId,
    type,
    payload,
    createdAtLocal,
    status: "pending",
    attemptCount: 0,
    lastError: null,
  });

  // Trigger a debounced drain if the device is online
  if (typeof navigator !== "undefined" && navigator.onLine) {
    scheduleDebouncedDrain();
  }
}
