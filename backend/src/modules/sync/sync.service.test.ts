import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const resolveAccountContext = vi.hoisted(() => vi.fn());
vi.mock("../accounts/account-context.js", () => ({ resolveAccountContext }));

import { pushSyncBatch } from "./sync.service.js";

const actor = { id: "user-1", email: "owner@example.com" } as User;

function dbWithRpc(result: { data?: unknown; error?: { code?: string; message?: string } }) {
  const rpc = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({
    update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
  });
  return { rpc, from } as unknown as SupabaseClient;
}

function batchItem(overrides: Record<string, unknown> = {}) {
  return {
    client_id: "mutation-1",
    mutation_id: "mutation-1",
    idempotency_key: "mutation-1",
    entity_id: "sale-1",
    type: "sale",
    payload: { id: "sale-1", branchId: "branch-a", clientId: "sale-1" },
    created_at_local: new Date().toISOString(),
    ...overrides,
  };
}

describe("Node sync push contract", () => {
  beforeEach(() => resolveAccountContext.mockReset());

  it("rejects a worker mutation outside its assigned branch before calling SQL", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "WORKER", businessId: "business-1", branchIds: ["branch-a"], permissions: ["POS_SELL"] });
    const db = dbWithRpc({ data: { status: "applied" } });

    const response = await pushSyncBatch(db, actor, { batch: [batchItem({ payload: { id: "sale-1", branchId: "branch-b" } })] });

    expect(response.results[0]).toMatchObject({ status: "permanent_failure", error: { code: "FORBIDDEN" } });
    expect((db.rpc as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("returns a retryable dependency code for a foreign-key readiness error", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "BUSINESS_OWNER", businessId: "business-1", branchIds: [], permissions: [] });
    const db = dbWithRpc({ data: null, error: { code: "23503", message: "Referenced categories is not synced yet" } });

    const response = await pushSyncBatch(db, actor, { batch: [batchItem()] });

    expect(response.results[0]).toMatchObject({
      status: "retryable_error",
      error: {
        code: "DEPENDENCY_NOT_READY",
        message: "Referenced categories is not synced yet. The prerequisite must sync before this change can be applied.",
      },
    });
  });

  it("requires product expected_version to match the canonical snapshot", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "BUSINESS_OWNER", businessId: "business-1", branchIds: [], permissions: [] });
    const db = dbWithRpc({ data: { status: "applied", version: 2 } });
    const product = { id: "product-1", version: 1, name: "Rice", sku: "RICE", categoryId: null, brandId: null, unitLabel: "piece", costPrice: 1, sellPrice: 2, expiryTracking: "off", expiryDate: null, lowStockThreshold: null };

    const response = await pushSyncBatch(db, actor, { batch: [batchItem({ type: "product", entity_id: "product-1", payload: product, expected_version: 1 })] });

    expect(response.results[0]).toMatchObject({ status: "applied", version: 2 });
    expect((db.rpc as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("sync_apply_product", { payload: product, actor_id: actor.id });
  });

  it("does not accept a product mutation with a missing expected version", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "BUSINESS_OWNER", businessId: "business-1", branchIds: [], permissions: [] });
    const db = dbWithRpc({ data: null });
    const product = { id: "product-1", version: 1, name: "Rice" };

    await expect(pushSyncBatch(db, actor, { batch: [batchItem({ type: "product", payload: product })] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect((db.rpc as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("propagates an authoritative RPC identity when a mutable entity is canonicalized", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "BUSINESS_OWNER", businessId: "business-1", branchIds: [], permissions: [] });
    const db = dbWithRpc({ data: { status: "skipped", id: "category-server", duplicate: true } });
    const response = await pushSyncBatch(db, actor, { batch: [batchItem({ type: "category", entity_id: "category-local", payload: { id: "category-local", name: "drinks" } })] });
    expect(response.results[0]).toMatchObject({ status: "skipped", submittedEntityId: "category-local", authoritativeEntityId: "category-server", canonicalized: true, entityId: "category-server" });
  });

  it("rejects a worker stock adjustment without the explicit adjustment capability", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "WORKER", businessId: "business-1", branchIds: ["branch-a"], permissions: ["VIEW_PRODUCTS"] });
    const db = dbWithRpc({ data: { status: "applied" } });

    const response = await pushSyncBatch(db, actor, {
      batch: [batchItem({ type: "stock_adjustment", entity_id: "adjustment-1", payload: { id: "adjustment-1", clientId: "adjustment-1", branchId: "branch-a", productId: "product-1", quantityDelta: 2 } })],
    });

    expect(response.results[0]).toMatchObject({ status: "permanent_failure", error: { code: "FORBIDDEN" } });
    expect((db.rpc as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("allows a worker product mutation with MANAGE_PRODUCTS", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "WORKER", businessId: "business-1", branchIds: ["branch-a"], permissions: ["MANAGE_PRODUCTS"] });
    const db = dbWithRpc({ data: { status: "applied", version: 2 } });
    const product = { id: "product-1", version: 1, name: "Rice", sku: "RICE", categoryId: null, brandId: null, unitLabel: "piece", costPrice: 1, sellPrice: 2, expiryTracking: "off", expiryDate: null, lowStockThreshold: null };

    const response = await pushSyncBatch(db, actor, { batch: [batchItem({ type: "product", entity_id: "product-1", payload: product, expected_version: 1 })] });

    expect(response.results[0]).toMatchObject({ status: "applied", version: 2 });
    expect((db.rpc as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("sync_apply_product", { payload: product, actor_id: actor.id });
  });

  it("requires USE_CUSTOMER_CREDIT in addition to POS_SELL for credit sales", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "WORKER", businessId: "business-1", branchIds: ["branch-a"], permissions: ["POS_SELL"] });
    const db = dbWithRpc({ data: { status: "applied" } });

    const response = await pushSyncBatch(db, actor, {
      batch: [batchItem({ payload: { id: "sale-1", clientId: "sale-1", branchId: "branch-a", payments: [{ method: "credit", amount: 100 }] } })],
    });

    expect(response.results[0]).toMatchObject({ status: "permanent_failure", error: { code: "FORBIDDEN" } });
    expect((db.rpc as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("waits for the Realtime wake-up before returning an accepted outbox mutation", async () => {
    resolveAccountContext.mockResolvedValue({ accountType: "BUSINESS_OWNER", businessId: "business-1", branchIds: [], permissions: [] });
    const db = dbWithRpc({ data: { status: "applied" } }) as SupabaseClient;
    const releases: Array<(value: { success: true }) => void> = [];
    const send = vi.fn(() => new Promise<{ success: true }>((resolve) => {
      releases.push(resolve);
    }));
    (db as unknown as { channel: ReturnType<typeof vi.fn> }).channel = vi.fn(() => ({ httpSend: send }));
    (db as unknown as { removeChannel: ReturnType<typeof vi.fn> }).removeChannel = vi.fn(async () => "ok");

    let finished = false;
    const request = pushSyncBatch(db, actor, { batch: [batchItem()] }).then(() => {
      finished = true;
    });

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(finished).toBe(false);

    for (const release of releases) release({ success: true });
    await request;
    expect(finished).toBe(true);
  });
});
