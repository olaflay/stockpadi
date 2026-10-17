import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId, clearLocalBusinessId } from "@/lib/local-tenant";
import { drainOutbox, SALE_FAST_LANE_TIMEOUT_MS, DEFAULT_PUSH_TIMEOUT_MS } from "@/features/sync/drain-outbox";
import { runSyncCycle } from "@/features/sync/SyncCoordinator";
import { getSyncRuntimePhase, setSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import { NetworkUnavailableError } from "@/platform/api/backend-client";

let mockSession: { access_token: string } | null = { access_token: "test-token" };
let mockSessionDelayMs = 0;

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => {
        if (mockSessionDelayMs > 0) {
          return new Promise((resolve) => setTimeout(() => resolve({ data: { session: mockSession } }), mockSessionDelayMs));
        }
        return Promise.resolve({ data: { session: mockSession } });
      },
    },
  }),
}));

const serverPost = vi.hoisted(() => vi.fn());

vi.mock("@/platform/api/backend-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/api/backend-client")>();
  return {
    ...actual,
    serverPost,
  };
});

const BUSINESS_ID = "adversarial-test-business";

describe("Sync Timeout and UI Unfreeze Protection", () => {
  beforeEach(async () => {
    mockSession = { access_token: "test-token" };
    mockSessionDelayMs = 0;
    serverPost.mockReset();
    clearLocalBusinessId();
    await setLocalBusinessId(BUSINESS_ID);
    await Promise.all([
      db.outbox.clear(),
      db.sales.clear(),
      db.products.clear(),
      db.stockMovements.clear(),
      db.syncLeases.clear(),
    ]);
    setSyncRuntimePhase("idle");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setSyncRuntimePhase("idle");
    await Promise.all([
      db.outbox.clear(),
      db.syncLeases.clear(),
    ]);
  });

  it("ensures local queries resolve immediately and are never blocked while a network sync stalls", async () => {
    // 1. Seed a local sale and product in IndexedDB
    const saleId = "sale-stall-test-1";
    await db.products.put({
      id: "prod-1",
      businessId: BUSINESS_ID,
      name: "Milk",
      sku: "MILK-1",
      costPrice: 500,
      sellPrice: 700,
      unitLabel: "carton",
      version: 1,
      archived: false,
    } as any);

    await db.sales.put({
      id: saleId,
      clientId: saleId,
      businessId: BUSINESS_ID,
      branchId: "main",
      customerId: null,
      items: [{ productId: "prod-1", quantity: 2, unitPrice: 700, discount: 0, unitLabel: "carton", conversionFactor: 1, movementClientId: "mov-1", unitCost: 500, costBasis: "snapshot", productVersion: 1, costFlags: [] }],
      payments: [{ method: "cash", amount: 1400 }],
      subtotal: 1400,
      discount: 0,
      total: 1400,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "cashier-1",
      voidedAt: null,
    });

    await db.outbox.put({
      clientId: saleId,
      mutationId: saleId,
      idempotencyKey: saleId,
      payloadVersion: 1,
      businessId: BUSINESS_ID,
      type: "sale",
      operation: "append",
      payload: { id: saleId, branchId: "main", items: [] },
      createdAtLocal: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
      lastError: null,
      errorCode: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextAttemptAt: null,
      sequence: 1,
      entityId: saleId,
    });

    // 2. Simulate network push stalling or taking longer than fast lane timeout
    let pushAborted = false;
    serverPost.mockImplementation(async (_path: string, _body: unknown, options?: { timeoutMs?: number }) => {
      expect(options?.timeoutMs).toBeLessThanOrEqual(SALE_FAST_LANE_TIMEOUT_MS);
      // Simulate network hanging and then throwing a network timeout error
      await new Promise((resolve) => setTimeout(resolve, 50));
      pushAborted = true;
      throw new NetworkUnavailableError("The backend request timed out.");
    });

    // 3. Initiate the sync cycle in the background
    const syncPromise = runSyncCycle("sale");
    expect(["syncing", "uploading"]).toContain(getSyncRuntimePhase());

    // 4. Concurrently perform live queries (metrics gathering simulation)
    const readStart = performance.now();
    const [sales, products, outboxItems] = await Promise.all([
      db.sales.where("businessId").equals(BUSINESS_ID).toArray(),
      db.products.where("businessId").equals(BUSINESS_ID).toArray(),
      db.outbox.where("businessId").equals(BUSINESS_ID).toArray(),
    ]);
    const readDuration = performance.now() - readStart;

    // Local IndexedDB read must resolve in under 50ms without lock contention
    expect(readDuration).toBeLessThan(50);
    expect(sales).toHaveLength(1);
    expect(products).toHaveLength(1);
    expect(outboxItems).toHaveLength(1);

    // 5. Await the aborted sync cycle completion
    await syncPromise;
    expect(pushAborted).toBe(true);

    // 6. Assert that runtime phase reverted to 'idle' (banner reverts from Saving to idle)
    expect(getSyncRuntimePhase()).toBe("idle");

    // 7. Verify outbox integrity: item preserved with retry metadata, zero data loss
    const preserved = await db.outbox.get(saleId);
    expect(preserved).toBeDefined();
    expect(preserved?.status).toBe("pending");
    expect(preserved?.lastError).toContain("timed out");
  });

  it("gracefully recovers and returns to idle when Supabase auth session stalls indefinitely", async () => {
    const saleId = "sale-auth-stall-test";
    await db.outbox.put({
      clientId: saleId,
      mutationId: saleId,
      idempotencyKey: saleId,
      payloadVersion: 1,
      businessId: BUSINESS_ID,
      type: "sale",
      operation: "append",
      payload: { id: saleId },
      createdAtLocal: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
      lastError: null,
      errorCode: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextAttemptAt: null,
      sequence: 1,
      entityId: saleId,
    });

    // Simulate gotrue-lock hanging for 10 seconds (exceeding AUTH_SESSION_TIMEOUT_MS = 3s)
    mockSessionDelayMs = 4_000;

    const drainStart = performance.now();
    const drainResult = await drainOutbox({ types: ["sale"] });
    const drainDuration = performance.now() - drainStart;

    // Must have aborted via Promise.race timeout around ~3,000ms instead of hanging for 10s
    expect(drainDuration).toBeLessThan(3_800);
    expect(drainResult.drained).toBe(0);

    // Item must remain safely queued in outbox
    const item = await db.outbox.get(saleId);
    expect(item?.status).toBe("pending");
  });

  it("coalesces concurrent drainOutbox calls without duplicate pushes or lock contention", async () => {
    const saleId1 = "sale-coalesce-1";
    const saleId2 = "sale-coalesce-2";

    await db.outbox.bulkPut([
      {
        clientId: saleId1,
        mutationId: saleId1,
        idempotencyKey: saleId1,
        payloadVersion: 1,
        businessId: BUSINESS_ID,
        type: "sale",
        operation: "append",
        payload: { id: saleId1 },
        createdAtLocal: new Date().toISOString(),
        status: "pending",
        attemptCount: 0,
        lastError: null,
        errorCode: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextAttemptAt: null,
        sequence: 1,
        entityId: saleId1,
      },
      {
        clientId: saleId2,
        mutationId: saleId2,
        idempotencyKey: saleId2,
        payloadVersion: 1,
        businessId: BUSINESS_ID,
        type: "sale",
        operation: "append",
        payload: { id: saleId2 },
        createdAtLocal: new Date().toISOString(),
        status: "pending",
        attemptCount: 0,
        lastError: null,
        errorCode: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextAttemptAt: null,
        sequence: 2,
        entityId: saleId2,
      },
    ]);

    let pushCount = 0;
    serverPost.mockImplementation(async (path: string, body: any) => {
      if (path === "/api/sync/push") {
        pushCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          results: (body.batch ?? []).map((item: any) => ({
            clientId: item.client_id,
            mutationId: item.mutation_id,
            status: "applied",
          })),
        };
      }
      return {};
    });

    // Fire 3 concurrent calls to drainOutbox
    const [r1, r2, r3] = await Promise.all([
      drainOutbox({ types: ["sale"] }),
      drainOutbox({ types: ["sale"] }),
      drainOutbox({ types: ["sale"] }),
    ]);

    // All 3 calls must resolve without error
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();

    // The batch must only have been pushed once (coalesced)
    expect(pushCount).toBe(1);

    // Both sales should now be in awaitingConfirmation (syncing state)
    const outboxAfter = await db.outbox.toArray();
    expect(outboxAfter.every((item) => item.status === "syncing" && item.awaitingConfirmation)).toBe(true);
  });
});
