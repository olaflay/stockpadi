import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { canResolveConflictInPlace, discardConflictingSnapshot } from "../conflict-resolution";

describe("owner conflict resolution", () => {
  beforeEach(async () => {
    await db.outbox.clear();
    await db.inventoryStock.clear();
    await db.syncPullState.clear();
  });

  it("removes only the rejected product snapshot and preserves existing branch stock before the cloud re-read", async () => {
    await db.inventoryStock.put({
      id: "business-a:product-a:main", businessId: "business-a", productId: "product-a", branchId: "main", quantity: 15, updatedAt: "2026-09-21T10:00:00.000Z",
    });
    await db.syncPullState.put({
      id: "business-a:session", businessId: "business-a", cursor: "old-complete-cursor", startedAt: null, completedAt: null,
      pagesFetched: 2, entityCounts: {}, partialErrors: [], lastCompletePullAt: "2026-09-21T10:00:00.000Z",
    });
    const conflict = {
      clientId: "product-a", mutationId: "product-a", idempotencyKey: "product-a", entityId: "product-a", businessId: "business-a",
      type: "product" as const, operation: "upsert" as const, status: "conflict" as const, payload: { id: "product-a", name: "Product A" },
      createdAtLocal: "2026-09-21T10:00:00.000Z", attemptCount: 1, lastError: "Changed elsewhere",
    };
    await db.outbox.put(conflict);

    expect(canResolveConflictInPlace(conflict)).toBe(true);
    await discardConflictingSnapshot(conflict);

    expect(await db.outbox.get("product-a")).toBeUndefined();
    expect(await db.inventoryStock.get("business-a:product-a:main")).toMatchObject({ quantity: 15 });
    expect(await db.syncPullState.get("business-a:session")).toMatchObject({ cursor: null });
  });

  it("never offers destructive queue removal for stock ledger history", () => {
    expect(canResolveConflictInPlace({
      clientId: "sale-a", type: "sale", status: "conflict", payload: {}, createdAtLocal: "2026-09-21T10:00:00.000Z", attemptCount: 1, lastError: "Conflict",
    })).toBe(false);
  });
});
