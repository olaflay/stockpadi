import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";

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

  it("holds dependent opening stock until its product result is applied", async () => {
    mockSession = { access_token: "test-token" };
    await db.outbox.bulkAdd([
      { clientId: "product-1", entityId: "product-1", type: "product", payload: { id: "product-1", version: 1 }, createdAtLocal: "2026-01-01T00:00:00.000Z", sequence: 1, status: "pending", attemptCount: 0, lastError: null },
      { clientId: "movement-1", entityId: "product-1", type: "stock_adjustment", payload: { productId: "product-1" }, createdAtLocal: "2026-01-01T00:00:00.000Z", sequence: 2, dependsOn: ["product-1"], status: "pending", attemptCount: 0, lastError: null },
    ]);
    const batches: string[][] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { batch: Array<{ client_id: string }> };
      batches.push(body.batch.map((item) => item.client_id));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: body.batch.map((item) => ({ clientId: item.client_id, status: "applied", ...(item.client_id === "product-1" ? { version: 1 } : {}) })) }) });
    }));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(batches).toEqual([["product-1"], ["movement-1"]]);
    expect(await db.outbox.toArray()).toHaveLength(0);
  });

  it("links a queued product to its queued category before batching", async () => {
    await setLocalBusinessId("test-business");
    await db.categories.put({ id: "category-before-product", businessId: "test-business", name: "Drinks" });
    await db.outbox.bulkAdd([
      {
        clientId: "product-category-order",
        mutationId: "product-category-order",
        entityId: "product-category-order",
        type: "product",
        operation: "upsert",
        expectedVersion: 1,
        payload: { id: "product-category-order", version: 1, categoryId: "category-before-product" },
        createdAtLocal: new Date().toISOString(),
        status: "pending",
        attemptCount: 0,
        lastError: null,
        businessId: "test-business",
      },
      {
        clientId: "category-before-product",
        mutationId: "category-before-product",
        entityId: "category-before-product",
        type: "category",
        operation: "upsert",
        payload: { id: "category-before-product", name: "Drinks" },
        createdAtLocal: new Date().toISOString(),
        status: "pending",
        attemptCount: 0,
        lastError: null,
        businessId: "test-business",
      },
    ]);

    mockSession = { access_token: "test-token" };
    const batches: string[][] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { batch: Array<{ client_id: string; type: string }> };
      batches.push(body.batch.map((item) => item.type));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: body.batch.map((item) => ({ clientId: item.client_id, status: "applied", ...(item.type === "product" ? { version: 1 } : {}) })) }),
      });
    }));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(batches).toEqual([["category"], ["product"]]);
    expect(await db.outbox.toArray()).toHaveLength(0);
  });

  it("recreates a missing local category mutation before retrying its dependent product", async () => {
    await setLocalBusinessId("test-business");
    await db.categories.put({ id: "category-1", businessId: "test-business", name: "Drinks" });
    await db.outbox.add({
      clientId: "product-with-category",
      mutationId: "product-with-category",
      idempotencyKey: "product-with-category",
      entityId: "product-with-category",
      type: "product",
      operation: "upsert",
      expectedVersion: 1,
      payload: { id: "product-with-category", version: 1, categoryId: "category-1" },
      createdAtLocal: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
      lastError: null,
      errorCode: "DEPENDENCY_NOT_READY",
      lastErrorCode: "DEPENDENCY_NOT_READY",
      businessId: "test-business",
      dependsOn: ["category-1"],
      dependsOnMutationIds: ["category-1"],
    });

    const batches: string[][] = [];
    mockSession = { access_token: "test-token" };
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { batch: Array<{ type: string }> };
      batches.push(body.batch.map((item) => item.type));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: body.batch.map((item) => ({ clientId: item.type === "category" ? "category-1" : "product-with-category", status: "applied" })),
        }),
      });
    }));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(batches).toEqual([["category"], ["product"]]);
    expect(await db.outbox.toArray()).toHaveLength(0);
  });

  it("keeps a product conflict distinguishable from a permanent validation failure", async () => {
    mockSession = { access_token: "test-token" };
    await db.outbox.add({ clientId: "product-conflict", entityId: "product-conflict", type: "product", payload: { id: "product-conflict", version: 1 }, createdAtLocal: new Date().toISOString(), status: "pending", attemptCount: 0, lastError: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [{ clientId: "product-conflict", status: "conflict", conflict: true }] }) }));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    const row = await db.outbox.get("product-conflict");
    expect(row?.status).toBe("conflict");
    expect(row?.errorCode).toBe("PRODUCT_CONFLICT");
  });

  it("automatically resumes account-blocked writes after local verification changes", async () => {
    mockSession = { access_token: "test-token" };
    await db.session.put({ id: "current", userId: "owner-1", deviceId: "device-1", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await db.localUsers.put({ id: "owner-1", fullName: "Owner", accountType: "BUSINESS_OWNER", businessId: "test-business", businessStatus: "pending", isActive: true, updatedAt: new Date().toISOString() });
    await queueSale("account-blocked");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ results: [{ clientId: "account-blocked", status: "applied" }] }) });
    vi.stubGlobal("fetch", fetchSpy);

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();
    expect((await db.outbox.get("account-blocked"))?.status).toBe("blocked");
    // A pending owner is probed through account-context so approval on
    // another device can wake the queue automatically; the mutation itself
    // must still remain blocked.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await db.localUsers.update("owner-1", { businessStatus: "verified" });
    await drainOutbox();
    // First drain refreshes account context and leaves the mutation blocked;
    // second drain refreshes it again, then pushes the now-unblocked mutation.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(await db.outbox.get("account-blocked")).toBeUndefined();
  });

  it("refreshes worker capabilities and branch assignments while the app is open", async () => {
    mockSession = { access_token: "test-token" };
    await db.session.put({ id: "current", userId: "worker-1", deviceId: "device-1", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await db.localUsers.put({
      id: "worker-1",
      fullName: "Cashier",
      accountType: "WORKER",
      businessId: "test-business",
      branchIds: ["old-branch"],
      permissions: ["POS_SELL"],
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        accountType: "WORKER",
        businessId: "test-business",
        businessStatus: "active",
        branchIds: ["branch-a"],
        permissions: ["VIEW_PRODUCTS", "POS_SELL"],
        profile: { is_active: true, email_verified: true },
      }),
    }));

    const { refreshActiveAccountContext } = await import("@/features/sync/drain-outbox");
    await expect(refreshActiveAccountContext()).resolves.toBe(true);

    expect(await db.localUsers.get("worker-1")).toMatchObject({
      permissions: ["VIEW_PRODUCTS", "POS_SELL"],
      branchIds: ["branch-a"],
      businessStatus: "active",
    });
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
