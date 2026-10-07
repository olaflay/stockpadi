import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { markOutboxNeedsReview } from "@/features/sync/reconcile-outbox";
import type { SyncQueueItem } from "@/types/sync";

describe("owner outbox reconciliation", () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.auditLogs.clear();
  });

  it("keeps the original financial mutation and records an unresolved review state", async () => {
    const item: SyncQueueItem = {
      clientId: "sale-client-1", mutationId: "sale-client-1", idempotencyKey: "sale-client-1", businessId: "business-a", type: "sale", operation: "append",
      payload: { id: "sale-1", total: 5000 }, createdAtLocal: new Date().toISOString(), status: "failed", attemptCount: 3, lastError: "HTTP 503",
    };
    await db.outbox.add(item);

    await markOutboxNeedsReview(item, "owner-1", "Cash was verified; retry with support");

    const retained = await db.outbox.get(item.clientId);
    expect(retained).toMatchObject({
      clientId: item.clientId,
      payload: item.payload,
      idempotencyKey: item.idempotencyKey,
      status: "needs_review",
      reconciliationStatus: "needs_review",
      reconciliationReason: "Cash was verified; retry with support",
    });
    expect(await db.auditLogs.toArray()).toHaveLength(1);
    expect((await db.auditLogs.toArray())[0].afterState).toMatchObject({ serverAcknowledged: false });
  });
});
