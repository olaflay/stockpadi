import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";

/**
 * REGRESSION: a stock count must resolve on a successful push, and must never
 * strand an outbox row.
 *
 * How this defect happened: sync_apply_stock_count is a review workflow. It
 * records a submission with review='pending' and never writes stock_movements,
 * so the inventory_stock_rollup row for that product+branch is untouched
 * (proved server-side in supabase/__tests__/defect-1-stock-count-projection.test.ts,
 * which asserts the rollup's updated_at is byte-identical after a count).
 *
 * drain-outbox.ts nevertheless listed "stock_count_submission" in
 * STOCK_AFFECTING_TYPES, which parks an acknowledged row at status="syncing"
 * with awaitingConfirmation=true instead of deleting it. The only thing that
 * ever clears that flag is applyInventory() matching on the inventory pull
 * actually returning that product+branch key - and the pull is cursor-based on
 * the rollup's updated_at, which a stock count never advances. Both crash
 * sweepers skip awaitingConfirmation rows, so the row leaked until some
 * unrelated movement happened to touch the same product+branch.
 *
 * getSyncSafety() counts "syncing" rows, so leaks aged the queue until 100
 * rows past 24h flipped `required` and refused to record a sale, stock
 * adjustment, purchase receipt, credit payment or expense - with an error
 * telling the operator to sync, which could never clear them.
 *
 * Every assertion below was written and observed FAILING against the unfixed
 * code before the fix was applied.
 */

const BUSINESS_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const BRANCH_ID = "33333333-3333-3333-3333-333333333333";

let mockSession: { access_token: string } | null = null;

vi.mock("@/lib/supabase", () => ({
  getSupabase: () =>
    mockSession
      ? { auth: { getSession: () => Promise.resolve({ data: { session: mockSession } }) } }
      : null,
}));

/** A stock count exactly as write-stock-adjustment.ts enqueues it. */
async function queueStockCount(clientId: string, productId = PRODUCT_ID) {
  await db.outbox.add({
    clientId,
    type: "stock_count_submission",
    entityId: productId,
    payload: {
      id: clientId,
      clientId,
      branchId: BRANCH_ID,
      productId,
      quantityDelta: 0,
      reasonCode: "cycle_count",
      note: null,
      createdAtLocal: new Date().toISOString(),
      countedQuantity: 137,
    },
    businessId: BUSINESS_ID,
    createdAtLocal: new Date().toISOString(),
    status: "pending",
    attemptCount: 0,
    lastError: null,
  } as never);
}

/** Simulates a row stranded by the previously shipped buggy build. */
async function seedStrandedStockCount(clientId: string) {
  await db.outbox.add({
    clientId,
    type: "stock_count_submission",
    entityId: PRODUCT_ID,
    payload: {
      id: clientId,
      clientId,
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityDelta: 0,
      reasonCode: "cycle_count",
      note: null,
      createdAtLocal: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      countedQuantity: 137,
    },
    businessId: BUSINESS_ID,
    createdAtLocal: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: "syncing",
    awaitingConfirmation: true,
    lastAttemptAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    attemptCount: 1,
    lastError: null,
  } as never);
}

function respond(results: Array<{ clientId: string; status: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results }),
  });
}

beforeEach(async () => {
  await db.outbox.clear();
  await setLocalBusinessId(BUSINESS_ID);
  mockSession = { access_token: "test-token" };
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("REGRESSION: a stock count resolves on a successful push", () => {
  it("is deleted, not parked at awaitingConfirmation", async () => {
    vi.stubGlobal("fetch", respond([{ clientId: "count-1", status: "applied" }]));
    await queueStockCount("count-1");

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(await db.outbox.toArray()).toEqual([]);
  });

  it("is also deleted when the server reports it as already applied (skipped)", async () => {
    vi.stubGlobal("fetch", respond([{ clientId: "count-1", status: "skipped" }]));
    await queueStockCount("count-1");

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(await db.outbox.toArray()).toEqual([]);
  });

  it("still keeps a genuine stock movement parked until its projection is pulled", async () => {
    // Guards against over-correcting: a stock_adjustment really does move the
    // projection, so it must still wait for the inventory pull. Only the
    // no-op mutation was over-classified.
    await db.outbox.add({
      clientId: "adj-1",
      type: "stock_adjustment",
      entityId: PRODUCT_ID,
      payload: {
        id: "adj-1",
        clientId: "adj-1",
        branchId: BRANCH_ID,
        productId: PRODUCT_ID,
        quantityDelta: 5,
        reasonCode: "damage",
        note: null,
        createdAtLocal: new Date().toISOString(),
      },
      businessId: BUSINESS_ID,
      createdAtLocal: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
      lastError: null,
    } as never);

    vi.stubGlobal("fetch", respond([{ clientId: "adj-1", status: "applied" }]));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();

    expect(await db.outbox.toArray()).toMatchObject([
      { clientId: "adj-1", status: "syncing", awaitingConfirmation: true },
    ]);
  });
});

describe("REGRESSION: stock counts never accumulate into a bricked shop", () => {
  it("leaves no residue after 100 counts on one product", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `count-${i}`);
    for (const id of ids) await queueStockCount(id);
    vi.stubGlobal("fetch", respond(ids.map((clientId) => ({ clientId, status: "applied" }))));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    const { getSyncSafety } = await import("@/features/sync/sync-safety");
    await drainOutbox();

    expect(await db.outbox.count()).toBe(0);
    expect((await getSyncSafety()).queueCount).toBe(0);
  });

  it("still rate-limits a genuine backlog of stock counts", async () => {
    // The fix must not remove the backpressure protection. A hundred counts
    // that genuinely cannot be pushed (no session, so nothing drains them)
    // must still trip SYNC_REQUIRED once they are old enough.
    mockSession = null;
    const ids = Array.from({ length: 100 }, (_, i) => `count-${i}`);
    for (const id of ids) await queueStockCount(id);
    await db.outbox.toCollection().modify({
      createdAtLocal: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    const { assertHighRiskWriteAllowed } = await import("@/features/sync/sync-safety");
    await expect(assertHighRiskWriteAllowed("stock_count_submission")).rejects.toThrow(
      /SYNC_REQUIRED/
    );
  });

  it("a shop with 100 previously stranded counts can sell again once healed", async () => {
    for (let i = 0; i < 100; i++) await seedStrandedStockCount(`stranded-${i}`);

    const { healStrandedStockCountSubmissions, drainOutbox } = await import(
      "@/features/sync/drain-outbox"
    );
    const { getSyncSafety, assertHighRiskWriteAllowed } = await import("@/features/sync/sync-safety");

    // Before healing: the shop is bricked and cannot sell.
    expect((await getSyncSafety()).required).toBe(true);
    await expect(assertHighRiskWriteAllowed("sale")).rejects.toThrow(/SYNC_REQUIRED/);

    const healed = await healStrandedStockCountSubmissions();
    expect(healed).toBe(100);

    // Healing returns the rows to pending; the server already holds every one of
    // these clientIds, so the drain replies "skipped" and retires them.
    const pending = await db.outbox.toArray();
    expect(pending).toHaveLength(100);
    expect(pending.every((row) => row.status === "pending" && !row.awaitingConfirmation)).toBe(true);

    vi.stubGlobal(
      "fetch",
      respond(pending.map((row) => ({ clientId: row.clientId, status: "skipped" })))
    );
    await drainOutbox();

    expect(await db.outbox.count()).toBe(0);
    expect((await getSyncSafety()).required).toBe(false);
    await expect(assertHighRiskWriteAllowed("sale")).resolves.toBeUndefined();
  });

  it("the heal is idempotent and never touches a row that is mid-flight", async () => {
    await seedStrandedStockCount("stranded-1");
    await db.outbox.add({
      clientId: "inflight",
      type: "sale",
      entityId: PRODUCT_ID,
      payload: { id: "inflight", clientId: "inflight", branchId: BRANCH_ID },
      businessId: BUSINESS_ID,
      createdAtLocal: new Date().toISOString(),
      status: "syncing",
      awaitingConfirmation: true,
      lastAttemptAt: new Date().toISOString(),
      attemptCount: 1,
      lastError: null,
    } as never);

    const { healStrandedStockCountSubmissions } = await import("@/features/sync/drain-outbox");

    expect(await healStrandedStockCountSubmissions()).toBe(1);
    expect(await healStrandedStockCountSubmissions()).toBe(0);

    // A sale legitimately awaiting confirmation is not a stranded stock count.
    expect(await db.outbox.get("inflight")).toMatchObject({
      status: "syncing",
      awaitingConfirmation: true,
    });
  });

  it("a healed row that the server already applied is dropped, not duplicated", async () => {
    await seedStrandedStockCount("stranded-1");

    const { healStrandedStockCountSubmissions, drainOutbox } = await import(
      "@/features/sync/drain-outbox"
    );
    await healStrandedStockCountSubmissions();

    // The server already applied this clientId before the row was stranded.
    vi.stubGlobal("fetch", respond([{ clientId: "stranded-1", status: "skipped" }]));
    await drainOutbox();

    expect(await db.outbox.toArray()).toEqual([]);
  });
});