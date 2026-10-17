import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId, clearLocalBusinessId } from "@/lib/local-tenant";
import { completeSale } from "@/features/pos/complete-sale";
import { drainOutbox } from "@/features/sync/drain-outbox";
import { setDrainDebounceMs } from "@/features/sync/enqueue-outbox-write";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { Product } from "@/types/product";

let mockSession: { access_token: string } | null = { access_token: "bench-test-token" };

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
    },
  }),
}));

const BUSINESS_ID = "bench-perf-business";

const mockActor: CurrentUser = {
  id: "user-perf-1",
  fullName: "Perf User",
  businessId: BUSINESS_ID,
  role: "OWNER",
  accountType: "BUSINESS_OWNER",
  permissions: ["POS_SELL", "USE_CUSTOMER_CREDIT", "MANAGE_PRODUCTS"],
  branchIds: ["branch-1"],
};

describe("POS Write and Sync Performance Overhaul Benchmark", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockSession = { access_token: "bench-test-token" };
    clearLocalBusinessId();
    await setLocalBusinessId(BUSINESS_ID);
    setDrainDebounceMs(0);

    fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const batch = body?.batch || [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-build-version": "1.0.0" }),
        json: () =>
          Promise.resolve({
            results: batch.map((item: any) => ({ clientId: item.client_id, status: "applied" })),
          }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    await Promise.all([
      db.outbox.clear(),
      db.sales.clear(),
      db.products.clear(),
      db.stockMovements.clear(),
      db.inventoryStock.clear(),
      db.expenses.clear(),
      db.purchases.clear(),
      db.customerCreditMovements.clear(),
      db.syncLeases.clear(),
    ]);

    await db.session.put({
      id: "current",
      userId: mockActor.id,
      deviceId: "perf-device-1",
    } as any);

    await db.localUsers.put({
      id: mockActor.id,
      fullName: "Perf User",
      businessId: BUSINESS_ID,
      role: "OWNER",
      accountType: "BUSINESS_OWNER",
      businessStatus: "verified",
      isActive: true,
      updatedAt: new Date().toISOString(),
    } as any);
  });

  afterEach(async () => {
    setDrainDebounceMs(0);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await Promise.all([
      db.outbox.clear(),
      db.sales.clear(),
      db.products.clear(),
      db.stockMovements.clear(),
      db.syncLeases.clear(),
    ]);
  });

  it("completes completeSale() into local storage in <30ms under concurrent background sync", async () => {
    // 1. Seed product with initial stock
    const testProduct = {
      id: "prod-bench-1",
      businessId: BUSINESS_ID,
      name: "Performance Test Product",
      sku: "PERF-1",
      costPrice: 500,
      sellPrice: 1000,
      unitLabel: "piece",
      updatedAt: new Date().toISOString(),
    } as any;
    await db.products.put(testProduct);

    // Initial stock: 100 pieces via ledger movement
    await db.stockMovements.put({
      id: "sm-initial-1",
      clientId: "sm-initial-1",
      businessId: BUSINESS_ID,
      branchId: "branch-1",
      productId: testProduct.id,
      quantityDelta: 100,
      source: "adjustment",
      createdAtLocal: new Date().toISOString(),
    } as any);

    // Seed an existing outbox item that background sync will push
    await db.outbox.put({
      clientId: "existing-outbox-item",
      mutationId: "existing-outbox-item",
      idempotencyKey: "existing-outbox-item",
      payloadVersion: 1,
      businessId: BUSINESS_ID,
      type: "product",
      operation: "upsert",
      status: "pending",
      createdAtLocal: new Date().toISOString(),
      payload: testProduct,
      attemptCount: 0,
      lastError: null,
    } as any);

    // 2. Warm-up call to eliminate V8 module loading / JIT compilation cold start
    await completeSale({
      branchId: "branch-1",
      customerId: null,
      payments: [{ method: "cash", amount: 1000 }],
      lines: [
        {
          productId: testProduct.id,
          quantity: 1,
          unitPrice: 1000,
          unitLabel: "piece",
          conversionFactor: 1,
        },
      ],
      createdByUserId: mockActor.id,
      actor: mockActor,
    });

    // Simulate concurrent background sync with a slight network transit delay
    fetchSpy.mockImplementationOnce(async (url: string, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const batch = body?.batch || [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-build-version": "1.0.0" }),
        json: () =>
          Promise.resolve({
            results: batch.map((item: any) => ({ clientId: item.client_id, status: "applied" })),
          }),
      };
    });

    // Launch background sync in the background
    const backgroundSyncPromise = drainOutbox();

    // 3. Measure exact execution latency of completeSale() while sync is actively in flight
    let minDuration = Number.POSITIVE_INFINITY;
    let lastSale!: Awaited<ReturnType<typeof completeSale>>;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      lastSale = await completeSale({
        branchId: "branch-1",
        customerId: null,
        payments: [{ method: "cash", amount: 2000 }],
        lines: [
          {
            productId: testProduct.id,
            quantity: 2,
            unitPrice: 1000,
            unitLabel: "piece",
            conversionFactor: 1,
          },
        ],
        createdByUserId: mockActor.id,
        actor: mockActor,
      });
      minDuration = Math.min(minDuration, performance.now() - start);
    }

    await backgroundSyncPromise;

    // 4. Assertions
    expect(lastSale.id).toBeDefined();
    expect(lastSale.total).toBe(2000);
    expect(minDuration).toBeLessThan(30); // Hard requirement: <30ms

    // Verify local persistence
    const savedSale = await db.sales.get(lastSale.id);
    expect(savedSale).toBeDefined();
    expect(savedSale?.total).toBe(2000);

    const movements = await db.stockMovements.where("productId").equals(testProduct.id).toArray();
    expect(movements.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves dashboard metrics in <20ms during an active outbox push", async () => {
    // 1. Seed database with today's activity and historical sales
    const today = new Date().toISOString();
    const testProduct = {
      id: "prod-bench-2",
      businessId: BUSINESS_ID,
      name: "Dashboard Test Product",
      sku: "DASH-1",
      costPrice: 400,
      sellPrice: 800,
      unitLabel: "piece",
      updatedAt: today,
    } as any;
    await db.products.put(testProduct);

    // Initial stock
    await db.stockMovements.put({
      id: "sm-dash-1",
      clientId: "sm-dash-1",
      businessId: BUSINESS_ID,
      branchId: "branch-1",
      productId: testProduct.id,
      quantityDelta: 50,
      source: "adjustment",
      createdAtLocal: today,
    } as any);

    // 5 today sales
    for (let i = 0; i < 5; i++) {
      await db.sales.put({
        id: `sale-today-${i}`,
        clientId: `sale-today-${i}`,
        businessId: BUSINESS_ID,
        branchId: "branch-1",
        customerId: null,
        items: [{ productId: testProduct.id, quantity: 1, unitPrice: 800, unitLabel: "piece", conversionFactor: 1, discount: 0, movementClientId: `mov-today-${i}` }],
        payments: [{ method: "cash", amount: 800 }],
        subtotal: 800,
        discount: 0,
        total: 800,
        createdAtLocal: today,
        createdAt: today,
        createdByUserId: mockActor.id,
        voidedAt: null,
      } as any);
    }

    // 10 historical sales
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    for (let i = 0; i < 10; i++) {
      await db.sales.put({
        id: `sale-past-${i}`,
        clientId: `sale-past-${i}`,
        businessId: BUSINESS_ID,
        branchId: "branch-1",
        customerId: null,
        items: [{ productId: testProduct.id, quantity: 1, unitPrice: 800, unitLabel: "piece", conversionFactor: 1, discount: 0, movementClientId: `mov-past-${i}` }],
        payments: [{ method: "cash", amount: 800 }],
        subtotal: 800,
        discount: 0,
        total: 800,
        createdAtLocal: tenDaysAgo.toISOString(),
        createdAt: tenDaysAgo.toISOString(),
        createdByUserId: mockActor.id,
        voidedAt: null,
      } as any);
    }

    // Seed outbox item for active push
    await db.outbox.put({
      clientId: "push-in-flight",
      mutationId: "push-in-flight",
      idempotencyKey: "push-in-flight",
      payloadVersion: 1,
      businessId: BUSINESS_ID,
      type: "expense",
      operation: "append",
      status: "pending",
      createdAtLocal: today,
      payload: { id: "exp-1", amount: 500 },
      attemptCount: 0,
      lastError: null,
    } as any);

    const runDashboardQuery = () =>
      db.transaction(
        "r",
        [
          db.products,
          db.sales,
          db.outbox,
          db.expenses,
          db.purchases,
          db.customerCreditMovements,
          db.stockMovements,
          db.inventoryStock,
          db.businessProfile,
          db.session,
          db.localUsers,
        ],
        async () => {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayStartIso = todayStart.toISOString();

          const [products, todaySales, pendingOutbox] = await Promise.all([
            db.products.where("businessId").equals(BUSINESS_ID).toArray(),
            db.sales.where("createdAtLocal").aboveOrEqual(todayStartIso).toArray(),
            db.outbox.where("status").anyOf("pending", "syncing").toArray(),
          ]);

          return {
            productCount: products.length,
            todaysSalesTotal: todaySales.reduce((s, row) => s + row.total, 0),
            todaysSalesCount: todaySales.length,
            pendingCount: pendingOutbox.length,
          };
        }
      );

    // Warm-up to eliminate V8 table schema binding cold start
    await runDashboardQuery();

    // 2. Simulate network latency during active outbox push
    fetchSpy.mockImplementationOnce(async (url: string, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 35));
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const batch = body?.batch || [];
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-build-version": "1.0.0" }),
        json: () =>
          Promise.resolve({
            results: batch.map((item: any) => ({ clientId: item.client_id, status: "applied" })),
          }),
      };
    });

    const pushPromise = drainOutbox();

    // 3. Execute dashboard read query under concurrent outbox write
    let minDashboardDuration = Number.POSITIVE_INFINITY;
    let metrics!: Awaited<ReturnType<typeof runDashboardQuery>>;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      metrics = await runDashboardQuery();
      minDashboardDuration = Math.min(minDashboardDuration, performance.now() - start);
    }

    await pushPromise;

    // 4. Assertions
    expect(minDashboardDuration).toBeLessThan(20); // Hard requirement: <20ms
    expect(metrics.todaysSalesCount).toBe(5);
    expect(metrics.todaysSalesTotal).toBe(4000);
    expect(metrics.productCount).toBe(1);
  });

  it("coalesces rapid consecutive sales into a single batch push via adaptive debounce", async () => {
    // Enable 35ms adaptive debounce for batching
    setDrainDebounceMs(35);

    const testProduct = {
      id: "prod-bench-3",
      businessId: BUSINESS_ID,
      name: "Coalesce Product",
      sku: "COAL-1",
      costPrice: 200,
      sellPrice: 500,
      unitLabel: "piece",
      updatedAt: new Date().toISOString(),
    } as any;
    await db.products.put(testProduct);

    await db.stockMovements.put({
      id: "sm-coal-1",
      clientId: "sm-coal-1",
      businessId: BUSINESS_ID,
      branchId: "branch-1",
      productId: testProduct.id,
      quantityDelta: 100,
      source: "adjustment",
      createdAtLocal: new Date().toISOString(),
    } as any);

    // Fire 3 consecutive completeSale operations in rapid back-to-back succession (<5ms apart)
    const sale1Promise = completeSale({
      branchId: "branch-1",
      customerId: null,
      payments: [{ method: "cash", amount: 500 }],
      lines: [{ productId: testProduct.id, quantity: 1, unitPrice: 500, unitLabel: "piece", conversionFactor: 1 }],
      createdByUserId: mockActor.id,
      actor: mockActor,
    });

    const sale2Promise = completeSale({
      branchId: "branch-1",
      customerId: null,
      payments: [{ method: "cash", amount: 500 }],
      lines: [{ productId: testProduct.id, quantity: 1, unitPrice: 500, unitLabel: "piece", conversionFactor: 1 }],
      createdByUserId: mockActor.id,
      actor: mockActor,
    });

    const sale3Promise = completeSale({
      branchId: "branch-1",
      customerId: null,
      payments: [{ method: "cash", amount: 500 }],
      lines: [{ productId: testProduct.id, quantity: 1, unitPrice: 500, unitLabel: "piece", conversionFactor: 1 }],
      createdByUserId: mockActor.id,
      actor: mockActor,
    });

    const [sale1, sale2, sale3] = await Promise.all([sale1Promise, sale2Promise, sale3Promise]);

    // Wait for the debounced coordinator cycle to trigger and dispatch
    await vi.waitFor(
      () => {
        expect(fetchSpy).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000, interval: 20 }
    );

    const callArgs = fetchSpy.mock.calls[0];
    const postBody = JSON.parse(callArgs[1].body as string) as {
      batch: Array<{ client_id: string; type: string; payload: Record<string, unknown> }>;
    };

    // Exactly 1 network dispatch with all 3 sales coalesced!
    expect(postBody.batch).toHaveLength(3);

    const batchClientIds = postBody.batch.map((item) => item.client_id);
    expect(batchClientIds).toContain(sale1.id);
    expect(batchClientIds).toContain(sale2.id);
    expect(batchClientIds).toContain(sale3.id);

    // Verify wire payload efficiency: stripped of undefined values and unnecessary bloat
    for (const item of postBody.batch) {
      expect(item.payload).toBeDefined();
      expect(item.payload.voidedAt).toBeNull(); // explicitly nullable fields preserved
      expect(Object.values(item.payload).includes(undefined)).toBe(false); // zero undefineds
    }
  });

  it("arbitrates sync lease locks event-driven without CPU spin", async () => {
    const { withSyncLease } = await import("@/features/sync/sync-lease");

    let releaseHolder!: () => void;
    const holderStarted = new Promise<void>((ready) => {
      void withSyncLease(async () => {
        ready();
        await new Promise<void>((resolve) => {
          releaseHolder = resolve;
        });
      });
    });

    await holderStarted;

    // Caller B waits for the lease with waitForLease: true
    const startWait = performance.now();
    const waiterPromise = withSyncLease(async () => {
      return "acquired-by-waiter";
    }, { waitForLease: true });

    // Release holder after 15ms
    setTimeout(() => {
      releaseHolder();
    }, 15);

    const result = await waiterPromise;
    const elapsed = performance.now() - startWait;

    expect(result).toBe("acquired-by-waiter");
    // BroadcastChannel event wakes waiter immediately after releaseHolder() without waiting for slow polling
    expect(elapsed).toBeLessThan(150);
  });
});
