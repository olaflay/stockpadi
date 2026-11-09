import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { clearLocalBusinessId, setLocalBusinessId } from "@/lib/local-tenant";
import { getSyncSafety } from "@/features/sync/sync-safety";

const BUSINESS_ID = "sync-safety-policy-business";

function row(index: number, createdAtLocal: string) {
  const id = `sale-${index}`;
  return {
    clientId: id,
    mutationId: id,
    idempotencyKey: id,
    payloadVersion: 1,
    businessId: BUSINESS_ID,
    type: "sale" as const,
    operation: "append" as const,
    payload: { id },
    createdAtLocal,
    status: "pending" as const,
    attemptCount: 0,
    lastError: null,
  };
}

describe("offline queue safety policy", () => {
  beforeEach(async () => {
    clearLocalBusinessId();
    await setLocalBusinessId(BUSINESS_ID);
    await db.outbox.clear();
  });

  afterEach(async () => {
    await db.outbox.clear();
    clearLocalBusinessId();
  });

  it("allows a busy current trading day below the absolute circuit breaker", async () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await db.outbox.bulkPut(Array.from({ length: 300 }, (_, index) => row(index, recent)));
    expect((await getSyncSafety()).required).toBe(false);
  });

  it("requires saving when a material queue has remained for 24 hours", async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await db.outbox.bulkPut(Array.from({ length: 100 }, (_, index) => row(index, stale)));
    expect((await getSyncSafety()).required).toBe(true);
  });

  it("trips the absolute 1,000-row breaker even when the queue is new", async () => {
    const recent = new Date().toISOString();
    await db.outbox.bulkPut(Array.from({ length: 1_000 }, (_, index) => row(index, recent)));
    expect((await getSyncSafety()).required).toBe(true);
  });
});
