// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocalBusinessId = vi.hoisted(() => vi.fn().mockResolvedValue("business-a"));
const recordRealtimeHint = vi.hoisted(() => vi.fn());
const recordRealtimeReconnect = vi.hoisted(() => vi.fn());
const recordSkippedPull = vi.hoisted(() => vi.fn());
const syncPullState = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
}));
const session = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ userId: "user-a" }) }));
const localUsers = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ accountType: "BUSINESS_OWNER" }) }));
const authStateHandler = vi.hoisted(() => vi.fn());
const unsubscribe = vi.hoisted(() => vi.fn());
const channelOn = vi.hoisted(() => vi.fn());
const channelSubscribe = vi.hoisted(() => vi.fn());
const removeChannel = vi.hoisted(() => vi.fn().mockResolvedValue("ok"));
const getSession = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } } }));
const salesPut = vi.hoisted(() => vi.fn().mockResolvedValue("sale-a"));
const stockFirst = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const stockPut = vi.hoisted(() => vi.fn().mockResolvedValue("movement-a"));
const creditFirst = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const creditPut = vi.hoisted(() => vi.fn().mockResolvedValue("credit-a"));
const outboxToArray = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const outboxBulkDelete = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const transaction = vi.hoisted(() => vi.fn(async (_mode: unknown, _tables: unknown, callback: () => Promise<void>) => callback()));
const stockMovements = vi.hoisted(() => ({
  where: vi.fn(() => ({ equals: vi.fn(() => ({ filter: vi.fn(() => ({ first: stockFirst })) })) })),
  put: stockPut,
  update: vi.fn(),
}));
const customerCreditMovements = vi.hoisted(() => ({
  where: vi.fn(() => ({ equals: vi.fn(() => ({ filter: vi.fn(() => ({ first: creditFirst })) })) })),
  put: creditPut,
  update: vi.fn(),
}));
const saleTable = vi.hoisted(() => ({ put: salesPut }));
const outbox = vi.hoisted(() => ({ toArray: outboxToArray, bulkDelete: outboxBulkDelete }));
const channel = vi.hoisted(() => ({ on: channelOn, subscribe: channelSubscribe }));
const supabase = vi.hoisted(() => ({
  auth: {
    getSession,
    onAuthStateChange: authStateHandler.mockImplementation(() => ({ data: { subscription: { unsubscribe } } })),
  },
  channel: vi.fn(() => channel),
  removeChannel,
}));

vi.mock("@/lib/local-tenant", () => ({ getLocalBusinessId }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => supabase }));
vi.mock("@/lib/db", () => ({
  SESSION_SINGLETON_ID: "current",
  db: { session, localUsers, syncPullState, sales: saleTable, stockMovements, customerCreditMovements, outbox, transaction },
}));
vi.mock("@/features/sync/sync-observability", () => ({ recordRealtimeHint, recordRealtimeReconnect, recordSkippedPull }));

import { startSyncRealtime } from "./sync-realtime";

describe("sync realtime wake-up", () => {
  let hintHandler: ((message: unknown) => void) | undefined;
  let saleHandler: ((message: unknown) => void) | undefined;
  let statusHandler: ((status: string) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    localUsers.get.mockResolvedValue({ accountType: "BUSINESS_OWNER" });
    salesPut.mockClear();
    stockFirst.mockResolvedValue(undefined);
    creditFirst.mockResolvedValue(undefined);
    outboxToArray.mockResolvedValue([]);
    hintHandler = undefined;
    saleHandler = undefined;
    statusHandler = undefined;
    syncPullState.get.mockResolvedValue({ id: "business-a:session", lastCompletePullAt: "2026-10-08T10:00:00.000Z" });
    channelOn.mockImplementation((_type: string, filter: { event?: string }, callback: (message: unknown) => void) => {
      if (filter.event === "sync_hint") hintHandler = callback;
      if (filter.event === "sale_committed") saleHandler = callback;
      return channel;
    });
    channelSubscribe.mockImplementation((callback: (status: string) => void) => {
      statusHandler = callback;
      callback("SUBSCRIBED");
      return channel;
    });
  });

  it("treats a valid Broadcast as a cursor-pull trigger, not local data", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(hintHandler).toBeDefined());

    hintHandler?.({ payload: {
      type: "sync_hint",
      scope: "sync:business:business-a",
      cursor: "2026-10-08T10:01:00.000Z",
    } });
    await vi.waitFor(() => expect(onTrigger).toHaveBeenCalledWith("realtime"));

    expect(syncPullState.update).toHaveBeenCalled();
    stop();
  });

  it("suppresses a stale hint without bypassing the durable cursor", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(hintHandler).toBeDefined());

    hintHandler?.({ payload: {
      type: "sync_hint",
      scope: "sync:business:business-a",
      cursor: "2026-10-08T09:59:00.000Z",
    } });
    await vi.waitFor(() => expect(recordSkippedPull).toHaveBeenCalledOnce());

    expect(onTrigger).not.toHaveBeenCalledWith("realtime");
    stop();
  });

  it("applies a valid completed sale event before requesting reconciliation", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(saleHandler).toBeDefined());

    saleHandler?.({ payload: {
      type: "sale_committed",
      scope: "sync:business:business-a",
      businessId: "business-a",
      status: "completed",
      sale: {
        id: "sale-a",
        clientId: "sale-client-a",
        businessId: "business-a",
        branchId: "branch-a",
        customerId: null,
        subtotal: 100,
        discount: 0,
        total: 100,
        createdAtLocal: "2026-10-09T10:00:00.000Z",
        createdAt: "2026-10-09T10:00:01.000Z",
        createdByUserId: "worker-a",
        workerId: "worker-a",
        voidedAt: null,
        items: [{ productId: "product-a", quantity: 2, unitPrice: 50, discount: 0, unitLabel: "unit", conversionFactor: 1, movementClientId: "movement-client-a", unitCost: 20, costBasis: "snapshot", productVersion: 1, costFlags: [] }],
        payments: [{ method: "cash", amount: 100 }],
        stockMovements: [{ id: "movement-a", clientId: "movement-client-a", businessId: "business-a", branchId: "branch-a", productId: "product-a", quantityDelta: -2, source: "sale", sourceReferenceId: "sale-a", reasonCode: null, createdAtLocal: "2026-10-09T10:00:00.000Z", createdAt: "2026-10-09T10:00:01.000Z", createdByUserId: "worker-a" }],
        creditMovements: [],
      },
    } });

    await vi.waitFor(() => expect(salesPut).toHaveBeenCalledWith(expect.objectContaining({ id: "sale-a" })));
    expect(onTrigger).toHaveBeenCalledWith("realtime");
    stop();
  });

  it("subscribes a worker to every assigned branch wake-up topic", async () => {
    localUsers.get.mockResolvedValue({ accountType: "WORKER", branchIds: ["branch-a", "branch-b"] });
    const stop = startSyncRealtime(vi.fn());

    await vi.waitFor(() => expect(supabase.channel).toHaveBeenCalledTimes(2));
    const topics = (supabase.channel.mock.calls as unknown as Array<[string]>).map(([topic]) => topic).sort();
    expect(topics).toEqual([
      "sync:business:business-a:branch:branch-a",
      "sync:business:business-a:branch:branch-b",
    ]);
    stop();
  });

  it("turns a Realtime reconnect into authoritative reconciliation", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(statusHandler).toBeDefined());

    statusHandler?.("SUBSCRIBED");
    expect(recordRealtimeReconnect).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("realtime-reconnect");
    stop();
  });
});
