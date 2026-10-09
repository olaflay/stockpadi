// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncSaleRealtimeEvent } from "@stockpadi/contracts";

const getLocalBusinessId = vi.hoisted(() => vi.fn().mockResolvedValue("business-a"));
const sessionGet = vi.hoisted(() => vi.fn().mockResolvedValue({ userId: "owner-a" }));
const localUserGet = vi.hoisted(() => vi.fn().mockResolvedValue({ accountType: "BUSINESS_OWNER" }));
const salesPut = vi.hoisted(() => vi.fn().mockResolvedValue("sale-a"));
const stockFirst = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const stockPut = vi.hoisted(() => vi.fn().mockResolvedValue("movement-a"));
const stockUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(1));
const creditFirst = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const creditPut = vi.hoisted(() => vi.fn().mockResolvedValue("credit-a"));
const creditUpdate = vi.hoisted(() => vi.fn().mockResolvedValue(1));
const outboxToArray = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const outboxBulkDelete = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const transaction = vi.hoisted(() => vi.fn(async (_mode: unknown, _tables: unknown, callback: () => Promise<void>) => callback()));

const stockMovements = vi.hoisted(() => ({
  where: vi.fn(() => ({ equals: vi.fn(() => ({ filter: vi.fn(() => ({ first: stockFirst })) })) })),
  put: stockPut,
  update: stockUpdate,
}));
const customerCreditMovements = vi.hoisted(() => ({
  where: vi.fn(() => ({ equals: vi.fn(() => ({ filter: vi.fn(() => ({ first: creditFirst })) })) })),
  put: creditPut,
  update: creditUpdate,
}));
const db = vi.hoisted(() => ({
  session: { get: sessionGet },
  localUsers: { get: localUserGet },
  sales: { put: salesPut },
  stockMovements,
  customerCreditMovements,
  outbox: { toArray: outboxToArray, bulkDelete: outboxBulkDelete },
  transaction,
}));

vi.mock("@/lib/local-tenant", () => ({ getLocalBusinessId }));
vi.mock("@/lib/db", () => ({ SESSION_SINGLETON_ID: "current", db }));

import { applyCommittedSaleEvent } from "./sync-realtime";

function committedSaleEvent(): SyncSaleRealtimeEvent {
  return {
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
      items: [{
        productId: "product-a",
        quantity: 2,
        unitPrice: 50,
        discount: 0,
        unitLabel: "unit",
        conversionFactor: 1,
        movementClientId: "movement-client-a",
        unitCost: 20,
        costBasis: "moving_weighted_average",
        productVersion: 3,
        costFlags: [],
      }],
      payments: [{ method: "cash", amount: 100, tenderedAmount: 100 }],
      stockMovements: [{
        id: "movement-a",
        clientId: "movement-client-a",
        businessId: "business-a",
        branchId: "branch-a",
        productId: "product-a",
        quantityDelta: -2,
        source: "sale",
        sourceReferenceId: "sale-a",
        reasonCode: null,
        createdAtLocal: "2026-10-09T10:00:00.000Z",
        createdAt: "2026-10-09T10:00:01.000Z",
        createdByUserId: "worker-a",
      }],
      creditMovements: [],
    },
  };
}

describe("committed sale realtime application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalBusinessId.mockResolvedValue("business-a");
    sessionGet.mockResolvedValue({ userId: "owner-a" });
    localUserGet.mockResolvedValue({ accountType: "BUSINESS_OWNER" });
    stockFirst.mockResolvedValue(undefined);
    creditFirst.mockResolvedValue(undefined);
    outboxToArray.mockResolvedValue([]);
  });

  it("updates the owner's local sales and stock immediately", async () => {
    const applied = await applyCommittedSaleEvent(committedSaleEvent());

    expect(applied).toBe(true);
    expect(transaction).toHaveBeenCalledOnce();
    expect(salesPut).toHaveBeenCalledWith(expect.objectContaining({ id: "sale-a", total: 100 }));
    expect(stockPut).toHaveBeenCalledWith(expect.objectContaining({ id: "movement-a", quantityDelta: -2 }));
  });

  it("is idempotent when the same event is delivered twice", async () => {
    const event = committedSaleEvent();
    await applyCommittedSaleEvent(event);

    stockFirst.mockResolvedValue({ id: "local-movement-a", businessId: "business-a" });
    await applyCommittedSaleEvent(event);

    expect(salesPut).toHaveBeenCalledTimes(2);
    expect(stockPut).toHaveBeenCalledTimes(1);
    expect(stockUpdate).toHaveBeenCalledWith("local-movement-a", expect.objectContaining({ id: "movement-a" }));
  });

  it("rejects an event from another tenant before touching local data", async () => {
    const event = committedSaleEvent();
    event.businessId = "business-b";
    event.sale.businessId = "business-b";

    expect(await applyCommittedSaleEvent(event)).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
    expect(salesPut).not.toHaveBeenCalled();
  });

  it("does not allow a worker session to apply the business-wide sale event", async () => {
    localUserGet.mockResolvedValue({ accountType: "WORKER" });

    expect(await applyCommittedSaleEvent(committedSaleEvent())).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });
});
