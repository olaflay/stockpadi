import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

/**
 * Covers the client-side half of the sync engine: what drainOutbox does to
 * the local outbox given a session, a network response, or a network
 * failure. The server-side merge logic itself is covered separately in
 * sync-apply-functions.test.ts against a real Postgres engine.
 */

let mockSession: { access_token: string } | null = null;
let mockConfigured = true;

vi.mock("@/lib/supabase", () => ({
  getSupabase: () =>
    mockConfigured
      ? {
          auth: {
            getSession: () => Promise.resolve({ data: { session: mockSession } }),
          },
        }
      : null,
}));

async function queueSale(clientId: string) {
  await db.outbox.add({
    clientId,
    type: "sale",
    payload: { id: clientId },
    createdAtLocal: new Date().toISOString(),
    status: "pending",
    attemptCount: 0,
    lastError: null,
  });
}

describe("drainOutbox", () => {
  beforeEach(async () => {
    await db.outbox.clear();
    mockSession = null;
    mockConfigured = true;
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when Supabase isn't configured yet (no env vars, no deployment), leaving queued items untouched", async () => {
    mockConfigured = false;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await queueSale("sale-1");

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(fetchSpy).not.toHaveBeenCalled();
    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("pending");
  });

  it("no-ops when there is no signed-in session, leaving queued items untouched", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await queueSale("sale-1");

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(fetchSpy).not.toHaveBeenCalled();
    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("pending");
  });

  it("removes items the server applied or skipped, keeps failed items with the error recorded", async () => {
    mockSession = { access_token: "test-token" };
    await queueSale("sale-ok");
    await queueSale("sale-bad");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { clientId: "sale-ok", status: "applied" },
              { clientId: "sale-bad", status: "error", error: { code: "FORBIDDEN", message: "Nope" } },
            ],
          }),
      })
    );

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    const remaining = await db.outbox.toArray();
    expect(remaining.map((item) => item.clientId)).toEqual(["sale-bad"]);
    expect(remaining[0].status).toBe("failed");
    expect(remaining[0].attemptCount).toBe(1);
    expect(remaining[0].lastError).toBe("Nope");
  });

  it("reverts items to pending (not failed) on a network failure, so a dropped connection is retried, not surfaced as a rejection", async () => {
    mockSession = { access_token: "test-token" };
    await queueSale("sale-1");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down"))
    );

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("pending");
    expect(remaining[0].attemptCount).toBe(1);
    expect(remaining[0].lastError).toBe("network down");
  });

  it("retryFailedOutboxItems re-queues failed items and re-attempts the push", async () => {
    mockSession = { access_token: "test-token" };
    await db.outbox.add({
      clientId: "sale-retry",
      type: "sale",
      payload: { id: "sale-retry" },
      createdAtLocal: new Date().toISOString(),
      status: "failed",
      attemptCount: 1,
      lastError: "previous failure",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [{ clientId: "sale-retry", status: "applied" }] }),
      })
    );

    const { retryFailedOutboxItems } = await import("@/features/sync/drain-outbox");
    await retryFailedOutboxItems();

    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(0);
  });

  it("drains a queue larger than one sync-push batch in multiple sub-batch calls, each within MAX_BATCH_SIZE", async () => {
    mockSession = { access_token: "test-token" };
    const ids = Array.from({ length: 600 }, (_, i) => `sale-${i}`);
    await db.outbox.bulkAdd(
      ids.map((clientId) => ({
        clientId,
        type: "sale" as const,
        payload: { id: clientId },
        createdAtLocal: new Date().toISOString(),
        status: "pending" as const,
        attemptCount: 0,
        lastError: null,
      }))
    );

    const batchSizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        batchSizes.push(body.batch.length);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: body.batch.map((item: { client_id: string }) => ({
                clientId: item.client_id,
                status: "applied",
              })),
            }),
        });
      })
    );

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(batchSizes).toEqual([500, 100]);
    for (const size of batchSizes) expect(size).toBeLessThanOrEqual(500);
    expect(await db.outbox.toArray()).toHaveLength(0);
  }, 20000);

  it("keeps an item retryable (pending) when the server response has no per-item result, rather than deleting it as if applied", async () => {
    mockSession = { access_token: "test-token" };
    await queueSale("sale-unknown");

    // Server returns a valid response but omits this item entirely — e.g. a
    // crash mid-batch after committing some rows. We cannot assume it applied,
    // so the row must be re-queued, not dropped (dropping = at-most-once,
    // possibly losing a sale the server never recorded).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
    );

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    const remaining = await db.outbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("pending");
    expect(remaining[0].attemptCount).toBe(1);
  });

  it("recoverStuckSyncingItems returns rows parked in the transient syncing state back to pending so the next drain retries them", async () => {
    await db.outbox.add({
      clientId: "sale-stuck",
      type: "sale",
      payload: { id: "sale-stuck" },
      createdAtLocal: new Date().toISOString(),
      status: "syncing",
      attemptCount: 0,
      lastError: null,
    });
    await db.outbox.add({
      clientId: "sale-pending",
      type: "sale",
      payload: { id: "sale-pending" },
      createdAtLocal: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
      lastError: null,
    });

    const { recoverStuckSyncingItems } = await import("@/features/sync/drain-outbox");
    await recoverStuckSyncingItems();

    const stuck = await db.outbox.where("clientId").equals("sale-stuck").first();
    expect(stuck?.status).toBe("pending");
    const untouched = await db.outbox.where("clientId").equals("sale-pending").first();
    expect(untouched?.status).toBe("pending");
  });
});
