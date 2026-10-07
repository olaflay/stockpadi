import { db } from "@/lib/db";
import type { SyncQueueItem } from "@/types/sync";

/**
 * Parks a failed mutation for owner review without deleting its payload or
 * idempotency key. A local note is explicitly not an authoritative resolution;
 * only a later server acknowledgement can retire the outbox row.
 */
export async function markOutboxNeedsReview(item: SyncQueueItem, actorUserId: string, reason: string): Promise<void> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new Error("A reconciliation reason is mandatory");
  const now = new Date().toISOString();
  await db.transaction("rw", db.outbox, db.auditLogs, async () => {
    const current = await db.outbox.get(item.clientId);
    if (!current) throw new Error("Outbox mutation no longer exists");
    await db.outbox.update(item.clientId, {
      status: "needs_review",
      reconciliationStatus: "needs_review",
      reconciliationReason: trimmedReason,
      reconciledAt: now,
      resolutionMetadata: { actorUserId, serverAcknowledged: false },
      lastError: current.lastError ?? "Awaiting authoritative resolution",
    });
    await db.auditLogs.add({
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      businessId: current.businessId,
      actorUserId,
      action: "OUTBOX_MUTATION_MARKED_NEEDS_REVIEW",
      entityType: current.type,
      entityId: current.clientId,
      beforeState: current,
      afterState: { status: "needs_review", reason: trimmedReason, serverAcknowledged: false },
      createdAtLocal: now,
    });
  });
}
