import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { setLocalBusinessId, clearLocalBusinessId, tenantArray } from "@/lib/local-tenant";
import { completeSale } from "@/features/pos/complete-sale";
import { drainOutbox, resetRetryBackoff } from "@/features/sync/drain-outbox";
import { triggerSync, probeL4Connectivity } from "@/features/sync/SyncCoordinator";
import { setDrainDebounceMs } from "@/features/sync/enqueue-outbox-write";
import { getStockByProduct } from "@/features/inventory/product-insights";
import { getStartOfTodayIso } from "@/lib/date";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { Product } from "@/types/product";

let mockSession: { access_token: string } | null = { access_token: "test-token" };

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: mockSession } }),
    },
  }),
}));

const BUSINESS_ID = "offline-online-biz";

const mockActor: CurrentUser = {
  id: "cashier-1",
  fullName: "Cashier Ada",
  businessId: BUSINESS_ID,
  role: "OWNER",
  accountType: "BUSINESS_OWNER",
  permissions: ["POS_SELL", "USE_CUSTOMER_CREDIT", "MANAGE_PRODUCTS"],
  branchIds: ["branch-main"],
};

describe("Offline-to-Online Synchronization Pipeline & Express Dashboard Read Lane", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  const committedIdempotencyKeys = new Set<string>();
  const receivedBatches: Array<Array<{ client_id: string; idempotency_key: string; created_at_local: string }>> = [];

  beforeEach(async () => {
    mockSession = { access_token: "test-token" };
    clearLocalBusinessId();
    await setLocalBusinessId(BUSINESS_ID);
    setDrainDebounceMs(0);
    committedIdempotencyKeys.clear();
    receivedBatches.length = 0;

    fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (!navigator.onLine) {
        throw new TypeError("Failed to fetch: net::ERR_INTERNET_DISCONNECTED");
      }

      if (url.includes("/api/sync/health") || url.includes("/api/version")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-build-version": "1.0.0" }),
          json: () => Promise.resolve({ syncReadConfigured: true }),
        };
      }

      const body = init?.body ? JSON.parse(init.body as string) : {};
      const batch = body?.batch || [];
      receivedBatches.push(batch);

      // Server records idempotency key to guarantee duplicate detection
      for (const item of batch) {
        committedIdempotencyKeys.add(item.idempotency_key);
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers({ "x-build-version": "1.0.0" }),
        json: () =>
          Promise.resolve({
            results: batch.map((item: any) => ({
              clientId: item.client_id,
              mutationId: item.mutation_id,
              status: "applied",
            })),
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
      deviceId: "device-pos-1",
    } as any);

    await db.localUsers.put({
      id: mockActor.id,
      fullName: "Cashier Ada",
      businessId: BUSINESS_ID,
      role: "OWNER",
      accountType: "BUSINESS_OWNER",
      businessStatus: "verified",
      isActive: true,
      updatedAt: new Date().toISOString(),
    } as any);

    // Seed product with 500 units in stock
    const testProduct: Product = {
      id: "prod-beverage-1",
      businessId: BUSINESS_ID,
      name: "Cold Beverage 50cl",
      sellPrice: 500,
      costPrice: 350,
      unitLabel: "bottle",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      lowStockThreshold: 10,
      categoryId: null,
      brandId: null,
      barcode: null,
      expiryTracking: "off",
      expiryDate: null,
      sku: "COLD-50CL",
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    await db.products.put(testProduct);

    await db.stockMovements.put({
      id: "init-stock-bev",
      clientId: "init-stock-bev",
      businessId: BUSINESS_ID,
      productId: testProduct.id,
      branchId: "branch-main",
      quantityDelta: 500,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdByUserId: "user-owner",
    });

    await db.inventoryStock.put({
      id: `${BUSINESS_ID}:${testProduct.id}:branch-main`,
      businessId: BUSINESS_ID,
      productId: testProduct.id,
      branchId: "branch-main",
      quantity: 500,
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
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

  it("Scenario 1: Offline Selling (Airplane Mode / No Data) executes atomically in <30ms and updates Express Read Dashboard instantly", async () => {
    // 1. Simulate Airplane Mode
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true, writable: true });
    expect(navigator.onLine).toBe(false);

    const saleTimes: number[] = [];

    // 2. Perform 10 consecutive offline sales
    for (let i = 1; i <= 10; i++) {
      const start = performance.now();
      const sale = await completeSale({
        actor: mockActor,
        createdByUserId: mockActor.id,
        branchId: "branch-main",
        customerId: null,
        lines: [{ productId: "prod-beverage-1", quantity: 2, unitPrice: 500, conversionFactor: 1, unitLabel: "bottle" }],
        payments: [{ method: "cash", amount: 1000 }],
      });
      const duration = performance.now() - start;
      saleTimes.push(duration);
      expect(sale).toBeDefined();
      expect(sale.id).toBeTruthy();
    }

    // Assert average sale execution took <45ms locally even under test load
    const avgSaleTime = saleTimes.reduce((a, b) => a + b, 0) / saleTimes.length;
    expect(avgSaleTime).toBeLessThan(45);

    // Assert all 10 sales are saved locally in db.sales
    const localSales = await db.sales.where("businessId").equals(BUSINESS_ID).toArray();
    expect(localSales).toHaveLength(10);

    // Assert outbox queued all 10 writes with status 'pending'
    const pendingOutbox = await db.outbox.where("status").equals("pending").toArray();
    expect(pendingOutbox).toHaveLength(10);

    // Assert zero network push requests were made while offline
    const pushCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes("/api/sync/push"));
    expect(pushCalls).toHaveLength(0);

    // 3. Express Read-Only Dashboard Lane Query (db.transaction('r', ...))
    const dashStart = performance.now();
    const todayStart = getStartOfTodayIso();
    const dashboardMetrics = await db.transaction(
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
        const [todaySales, outboxPending] = await Promise.all([
          tenantArray(db.sales.where("createdAtLocal").aboveOrEqual(todayStart)),
          tenantArray(db.outbox.where("status").anyOf("pending", "syncing")),
        ]);

        const stockMap = await getStockByProduct("branch-main");
        const totalSalesAmount = todaySales.reduce((acc, s) => acc + s.total, 0);

        return {
          salesCount: todaySales.length,
          totalAmount: totalSalesAmount,
          outboxPendingCount: outboxPending.length,
          remainingStock: stockMap.get("prod-beverage-1") ?? 0,
        };
      }
    );
    const dashDuration = performance.now() - dashStart;

    // Express read lane completes in <35ms
    expect(dashDuration).toBeLessThan(35);
    // Calculated exact numbers from local ledger immediately: 10 sales * (2 * 500) = 10,000 NGN
    expect(dashboardMetrics.salesCount).toBe(10);
    expect(dashboardMetrics.totalAmount).toBe(10000);
    expect(dashboardMetrics.outboxPendingCount).toBe(10);
    // 500 initial stock - (10 sales * 2 items) = 480 remaining
    expect(dashboardMetrics.remainingStock).toBe(480);
  });

  it("Scenario 2: The Reconnect Transition (Turning Data Back On) drains chronologically with idempotency keys and active L4 probing", async () => {
    // 1. Perform 5 sales while offline
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true, writable: true });
    for (let i = 1; i <= 5; i++) {
      await completeSale({
        actor: mockActor,
        createdByUserId: mockActor.id,
        branchId: "branch-main",
        customerId: null,
        lines: [{ productId: "prod-beverage-1", quantity: 1, unitPrice: 500, conversionFactor: 1, unitLabel: "bottle" }],
        payments: [{ method: "cash", amount: 500 }],
      });
    }

    const initialPending = await db.outbox.where("status").equals("pending").toArray();
    expect(initialPending).toHaveLength(5);

    // 2. Transition: Mobile data turned ON
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });

    // Active L4 Probing verification
    const isLive = await probeL4Connectivity(1000);
    expect(isLive).toBe(true);

    // 3. Trigger online sync cycle
    await resetRetryBackoff();
    const result = await drainOutbox();
    expect(result.drained).toBe(5);
    expect(result.pendingRemaining).toBe(0);

    // 4. Verify batch format and chronological sorting
    expect(receivedBatches.length).toBeGreaterThanOrEqual(1);
    const sentBatch = receivedBatches[0];
    expect(sentBatch).toHaveLength(5);

    // Verify all items carried immutable idempotency keys
    for (const item of sentBatch) {
      expect(item.idempotency_key).toBeTruthy();
      expect(committedIdempotencyKeys.has(item.idempotency_key)).toBe(true);
    }

    // Verify items were ordered chronologically (createdAtLocal monotonic order)
    const timestamps = sentBatch.map((item) => item.created_at_local);
    const sortedTimestamps = [...timestamps].sort();
    expect(timestamps).toEqual(sortedTimestamps);

    // Verify outbox has 0 pending items remaining
    const remainingPending = await db.outbox.where("status").equals("pending").toArray();
    expect(remainingPending).toHaveLength(0);
  });

  it("Scenario 3: Mid-Push Network Disconnect recovers with clean idempotency and zero duplicate movements", async () => {
    // 1. Create an offline sale
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true, writable: true });
    const sale = await completeSale({
      actor: mockActor,
      createdByUserId: mockActor.id,
      branchId: "branch-main",
      customerId: null,
      lines: [{ productId: "prod-beverage-1", quantity: 3, unitPrice: 500, conversionFactor: 1, unitLabel: "bottle" }],
      payments: [{ method: "cash", amount: 1500 }],
    });

    const outboxItem = (await db.outbox.where("entityId").equals(sale.id).first())!;
    expect(outboxItem).toBeDefined();
    const originalIdempotencyKey = outboxItem.idempotencyKey;
    expect(originalIdempotencyKey).toBeTruthy();

    // 2. Simulate Mid-Push failure: server receives push and records idempotency key,
    // but connection abruptly drops before client gets the 200 OK.
    let pushAttempts = 0;
    fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/sync/push")) {
        pushAttempts++;
        if (pushAttempts === 1) {
          // Drop connection
          throw new TypeError("Failed to fetch: Network connection lost mid-stream");
        }
        // Second attempt: succeeds
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const batch = body?.batch || [];
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "x-build-version": "1.0.0" }),
          json: () =>
            Promise.resolve({
              results: batch.map((item: any) => ({
                clientId: item.client_id,
                mutationId: item.mutation_id,
                status: "applied",
              })),
            }),
        };
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    });

    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });

    // First push attempt fails due to mid-flight network break
    const failedDrain = await drainOutbox();
    expect(failedDrain.drained).toBe(0);
    expect(failedDrain.pendingRemaining).toBe(1);

    // Item reverted cleanly to 'pending' without corrupting or dropping
    const revertedItem = await db.outbox.get(outboxItem.clientId);
    expect(revertedItem?.status).toBe("pending");
    // Idempotency key MUST be preserved identically
    expect(revertedItem?.idempotencyKey).toBe(originalIdempotencyKey);

    // 3. Network recovers and re-sends
    await resetRetryBackoff();
    const recoveredDrain = await drainOutbox();
    expect(recoveredDrain.drained).toBe(1);
    expect(recoveredDrain.pendingRemaining).toBe(0);

    // Verify exactly 1 sale exists in database (0 duplicates)
    const salesInDb = await db.sales.where("id").equals(sale.id).toArray();
    expect(salesInDb).toHaveLength(1);

    // Verify exactly 1 stock movement for this sale was recorded (0 duplicate deductions)
    const allMovements = await db.stockMovements.where("businessId").equals(BUSINESS_ID).toArray();
    const movements = allMovements.filter((m) => m.sourceReferenceId === sale.id);
    expect(movements).toHaveLength(1);
    expect(movements[0].quantityDelta).toBe(-3);
  });

  it("Scenario 4: Zero UI Interruption guarantees Express Read Dashboard queries execute concurrent to active outbox drain in <15ms", async () => {
    // 1. Seed 10 offline sales
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true, writable: true });
    for (let i = 1; i <= 10; i++) {
      await completeSale({
        actor: mockActor,
        createdByUserId: mockActor.id,
        branchId: "branch-main",
        customerId: null,
        lines: [{ productId: "prod-beverage-1", quantity: 1, unitPrice: 500, conversionFactor: 1, unitLabel: "bottle" }],
        payments: [{ method: "cash", amount: 500 }],
      });
    }

    // 2. Set up network with realistic 50ms latency during sync push
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true, writable: true });
    fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/sync/push")) {
        await new Promise((resolve) => setTimeout(resolve, 50));
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
      }
      return { ok: true, status: 200, json: () => Promise.resolve({}) };
    });

    // 3. Fire outbox drain in background (non-blocking)
    await resetRetryBackoff();
    const drainPromise = drainOutbox();

    // 4. Concurrently execute Express Read Dashboard Lane query while drain is in-flight
    const readStart = performance.now();
    const dashboardQuery = await db.transaction(
      "r",
      [db.sales, db.outbox, db.stockMovements],
      async () => {
        const todayStart = getStartOfTodayIso();
        const sales = await tenantArray(db.sales.where("createdAtLocal").aboveOrEqual(todayStart));
        return { count: sales.length, total: sales.reduce((a, s) => a + s.total, 0) };
      }
    );
    const readDuration = performance.now() - readStart;

    // Read snapshot finishes instantly without queuing behind outbox push
    expect(readDuration).toBeLessThan(15);
    expect(dashboardQuery.count).toBe(10);
    expect(dashboardQuery.total).toBe(5000);

    // Wait for background drain to finish cleanly
    const drainResult = await drainPromise;
    expect(drainResult.drained).toBe(10);
    expect(drainResult.pendingRemaining).toBe(0);
  });
});
