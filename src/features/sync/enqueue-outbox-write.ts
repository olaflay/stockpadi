import { db } from "@/lib/db";
import type { SyncEntityType } from "@/types/sync";

/**
 * The append-to-outbox half of every offline write — one queued row per
 * mutation, always called inside the same Dexie transaction as the data
 * write itself (must be, per .agents/rules/offline-sync-and-ledger.md).
 * Extracted since this exact shape was duplicated near-verbatim across
 * seven write-path files.
 */
export async function enqueueOutboxWrite(
  clientId: string,
  type: SyncEntityType,
  payload: unknown,
  createdAtLocal: string
): Promise<void> {
  await db.outbox.add({
    clientId,
    type,
    payload,
    createdAtLocal,
    status: "pending",
    attemptCount: 0,
    lastError: null,
  });
}
