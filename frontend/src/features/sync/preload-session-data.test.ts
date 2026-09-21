import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getStockByProduct } from "@/features/inventory/product-insights";
import { BackendRequestError } from "@/features/operations/server-client";

const serverGet = vi.hoisted(() => vi.fn());
vi.mock("@/features/operations/server-client", () => ({
  serverGet,
  BackendRequestError: class BackendRequestError extends Error { code = "SERVER_ERROR"; status = 500; },
  NetworkUnavailableError: class NetworkUnavailableError extends Error { code = "NETWORK_UNAVAILABLE"; },
}));

import { preloadSessionData } from "./preload-session-data";

describe("preloadSessionData diagnostics", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.suppliers.clear();
    await db.sales.clear();
    await db.inventoryStock.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();
    await db.syncDiagnostics.clear();
    await db.syncPullState.clear();
    await db.businessProfile.put({ id: BUSINESS_PROFILE_SINGLETON_ID, businessId: "test-business", name: "Test", businessTypeId: "retail", currency: "NGN" });
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: true });
    serverGet.mockReset();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("does not apply staged records when one dataset fails", async () => {
    serverGet.mockResolvedValue({ ok: true, businessId: "test-business", serverTime: "2026-09-11T10:00:00.000Z", cursor: "must-not-commit", nextCursor: null, hasMore: false, entities: [
      { entity: "products", success: true, records: [{ id: "p-1", name: "Rice", sku: "RICE", cost_price: 1, sell_price: 2, unit_label: "piece", expiry_tracking: "off", expiry_date: null, low_stock_threshold: null, version: 1, updated_at: new Date().toISOString() }], lastSuccessfulPullAt: "2026-09-11T10:00:00.000Z", error: null },
      { entity: "categories", success: false, records: [], lastSuccessfulPullAt: null, error: { code: "FORBIDDEN", message: "Not allowed" } },
    ] });

    const result = await preloadSessionData(true);

    expect(result.fullySynced).toBe(false);
    expect(result.pulls).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: "categories", success: false, error: { code: "FORBIDDEN", message: "Not allowed" } }),
      expect.objectContaining({ entity: "session", success: false }),
    ]));
    expect(await db.products.get("p-1")).toBeUndefined();
    expect(await db.syncDiagnostics.get("test-business:categories")).toMatchObject({ success: false, errorCode: "FORBIDDEN" });
  });

  it("keeps a transport failure visible instead of claiming that the cache is synced", async () => {
    serverGet.mockRejectedValue(new Error("backend unavailable"));

    const result = await preloadSessionData(true);

    expect(result.fullySynced).toBe(false);
    expect(result.pulls[0]).toMatchObject({ entity: "session", success: false, error: { code: "PULL_APPLY_FAILED" } });
    expect(await db.syncDiagnostics.get("test-business:session")).toMatchObject({ success: false });
  });

  it("continues opaque pull pages and applies suppliers, inventory projections, and payment metadata", async () => {
    await db.syncDiagnostics.put({
      id: "test-business:session",
      businessId: "test-business",
      endpoint: "/api/sync/pull",
      entity: "session",
      success: false,
      lastAttemptedAt: "2026-09-11T09:00:00.000Z",
      lastSuccessfulPullAt: null,
      errorCode: "NETWORK_UNAVAILABLE",
      errorMessage: "Backend unavailable",
      recordsApplied: 0,
    });
    serverGet
      .mockResolvedValueOnce({ ok: true, businessId: "test-business", serverTime: "2026-09-11T10:00:00.000Z", hasMore: true, nextCursor: "opaque-next", cursor: null, entities: [
        { entity: "suppliers", success: true, records: [{ id: "supplier-1", business_id: "test-business", name: "Supplier", phone: "0800", updated_at: "2026-09-11T10:00:00.000Z" }], lastSuccessfulPullAt: "2026-09-11T10:00:00.000Z", error: null },
        { entity: "inventory", success: true, records: [{ product_id: "p-1", branch_id: "branch-1", quantity: 12, updated_at: "2026-09-11T10:00:00.000Z" }], lastSuccessfulPullAt: "2026-09-11T10:00:00.000Z", error: null },
        { entity: "sales", success: true, records: [{ id: "sale-1", client_id: "sale-client-1", branch_id: "branch-1", customer_id: null, subtotal: 100, discount: 0, total: 100, created_at_local: "2026-09-11T10:00:00.000Z", created_at: "2026-09-11T10:00:00.000Z", created_by_user_id: "owner", items: [], payments: [{ method: "cash", amount: 100, tendered_amount: 150, note: "cash drawer" }] }], lastSuccessfulPullAt: "2026-09-11T10:00:00.000Z", error: null },
      ] })
      .mockResolvedValueOnce({ ok: true, businessId: "test-business", serverTime: "2026-09-11T10:00:00.000Z", hasMore: false, nextCursor: null, cursor: "opaque-complete", entities: [] });

    const result = await preloadSessionData(true);

    expect(result.fullySynced).toBe(true);
    expect(serverGet).toHaveBeenCalledTimes(2);
    expect(serverGet.mock.calls[1][0]).toBe("/api/sync/pull?cursor=opaque-next");
    expect(await db.suppliers.get("supplier-1")).toMatchObject({ name: "Supplier" });
    expect(await db.inventoryStock.get("test-business:p-1:branch-1")).toMatchObject({ quantity: 12 });
    expect((await db.sales.get("sale-1"))?.payments[0]).toMatchObject({ tenderedAmount: 150, note: "cash drawer" });
    expect((await db.syncPullState.get("test-business:session"))?.cursor).toBe("opaque-complete");
    expect(await db.syncDiagnostics.get("test-business:session")).toMatchObject({ success: true, errorCode: null, errorMessage: null });
  });

  it("merges a successful delta pull without deleting prior local products or another branch's inventory", async () => {
    await db.products.put({
      id: "existing-product", businessId: "test-business", name: "Existing", sku: "EXISTING", barcode: null,
      categoryId: null, brandId: null, costPrice: 10, sellPrice: 20, unitLabel: "piece", altUnitLabel: null,
      altUnitConversionFactor: null, altUnitSellPrice: null, expiryTracking: "off", expiryDate: null,
      lowStockThreshold: null, archived: false, version: 1, updatedAt: "2026-09-21T09:00:00.000Z",
    });
    await db.inventoryStock.put({
      id: "test-business:existing-product:main", businessId: "test-business", productId: "existing-product", branchId: "main", quantity: 15, updatedAt: "2026-09-21T09:00:00.000Z",
    });
    serverGet.mockResolvedValue({
      ok: true, businessId: "test-business", serverTime: "2026-09-21T10:00:00.000Z", cursor: "new-cursor", nextCursor: null, hasMore: false,
      entities: [{
        entity: "inventory", success: true,
        records: [{ product_id: "new-product", branch_id: "main", quantity: 0, updated_at: "2026-09-21T09:59:00.000Z" }],
        lastSuccessfulPullAt: "2026-09-21T10:00:00.000Z", error: null,
      }],
    });

    const result = await preloadSessionData(true, "manual");

    expect(result.fullySynced).toBe(true);
    expect(await db.products.get("existing-product")).toMatchObject({ name: "Existing" });
    expect(await db.inventoryStock.get("test-business:existing-product:main")).toMatchObject({ quantity: 15 });
    expect(await db.inventoryStock.get("test-business:new-product:main")).toMatchObject({ quantity: 0 });
  });

  it("uses the last completed cursor so a later device pull receives newer records", async () => {
    serverGet
      .mockResolvedValueOnce({
        ok: true,
        businessId: "test-business",
        serverTime: "2026-09-20T10:00:00.000Z",
        cursor: "completed-at-10",
        nextCursor: null,
        hasMore: false,
        entities: [{
          entity: "products",
          success: true,
          records: [{ id: "p-coke", name: "Coke 50cl", sku: "COKE", cost_price: 1, sell_price: 500, unit_label: "piece", expiry_tracking: "off", expiry_date: null, low_stock_threshold: null, version: 1, updated_at: "2026-09-20T09:59:00.000Z" }],
          lastSuccessfulPullAt: "2026-09-20T10:00:00.000Z",
          error: null,
        }],
      })
      .mockResolvedValueOnce({
        ok: true,
        businessId: "test-business",
        serverTime: "2026-09-20T10:06:00.000Z",
        cursor: "completed-at-10-06",
        nextCursor: null,
        hasMore: false,
        entities: [{
          entity: "products",
          success: true,
          records: [{ id: "p-new", name: "Popcorn", sku: "POPCORN", cost_price: 1, sell_price: 300, unit_label: "piece", expiry_tracking: "off", expiry_date: null, low_stock_threshold: null, version: 1, updated_at: "2026-09-20T10:05:00.000Z" }],
          lastSuccessfulPullAt: "2026-09-20T10:06:00.000Z",
          error: null,
        }],
      });

    await preloadSessionData(true, "boot");
    await preloadSessionData(true, "poll");

    expect(serverGet).toHaveBeenCalledTimes(2);
    expect(serverGet.mock.calls[1][0]).toBe("/api/sync/pull?cursor=completed-at-10");
    expect(await db.products.get("p-new")).toMatchObject({ name: "Popcorn", businessId: "test-business" });
    expect(await db.syncPullState.get("test-business:session")).toMatchObject({
      cursor: "completed-at-10-06",
      lastCompletePullAt: "2026-09-20T10:06:00.000Z",
      lastPullTrigger: "poll",
      lastServerContactAt: expect.any(String),
    });
  });

  it("does not advance the completed cursor when a pull page is only partially applied", async () => {
    await db.syncPullState.put({
      id: "test-business:session",
      businessId: "test-business",
      cursor: "last-complete",
      startedAt: "2026-09-20T10:00:00.000Z",
      completedAt: "2026-09-20T10:00:00.000Z",
      pagesFetched: 1,
      entityCounts: {},
      partialErrors: [],
      lastCompletePullAt: "2026-09-20T10:00:00.000Z",
      lastPullTrigger: "boot",
      lastInvalidationReceivedAt: null,
      lastServerContactAt: null,
      lastSuccessfulPushAt: null,
    });

    serverGet
      .mockResolvedValueOnce({
        ok: true,
        businessId: "test-business",
        serverTime: "2026-09-20T10:05:00.000Z",
        cursor: "must-not-be-committed",
        nextCursor: null,
        hasMore: false,
        entities: [
          {
            entity: "products",
            success: true,
            records: [{ id: "p-partial", name: "Pending Product", sku: "PENDING", cost_price: 1, sell_price: 2, unit_label: "piece", expiry_tracking: "off", expiry_date: null, low_stock_threshold: null, version: 1, updated_at: "2026-09-20T10:04:00.000Z" }],
            lastSuccessfulPullAt: "2026-09-20T10:05:00.000Z",
            error: null,
          },
          {
            entity: "inventory",
            success: false,
            records: [],
            lastSuccessfulPullAt: null,
            error: { code: "TEMPORARY_UNAVAILABLE", message: "Inventory was unavailable" },
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        businessId: "test-business",
        serverTime: "2026-09-20T10:06:00.000Z",
        cursor: "completed-after-retry",
        nextCursor: null,
        hasMore: false,
        entities: [{
          entity: "products",
          success: true,
          records: [{ id: "p-after-retry", name: "Product After Retry", sku: "RETRY", cost_price: 1, sell_price: 3, unit_label: "piece", expiry_tracking: "off", expiry_date: null, low_stock_threshold: null, version: 1, updated_at: "2026-09-20T10:05:30.000Z" }],
          lastSuccessfulPullAt: "2026-09-20T10:06:00.000Z",
          error: null,
        }],
      });

    const partial = await preloadSessionData(true, "poll");

    expect(partial.fullySynced).toBe(false);
    expect(await db.syncPullState.get("test-business:session")).toMatchObject({
      cursor: "last-complete",
      lastCompletePullAt: "2026-09-20T10:00:00.000Z",
    });

    const recovered = await preloadSessionData(true, "manual");

    expect(recovered.fullySynced).toBe(true);
    expect(serverGet.mock.calls[1][0]).toBe("/api/sync/pull?cursor=last-complete");
    expect(await db.products.get("p-after-retry")).toMatchObject({ name: "Product After Retry" });
    expect(await db.syncPullState.get("test-business:session")).toMatchObject({ cursor: "completed-after-retry" });
  });

  it("keeps acknowledged local stock when HTTP 500 prevents the confirming pull", async () => {
    await db.products.put({
      id: "product-a", businessId: "test-business", name: "Product A", sku: "PRODUCT-A", barcode: null,
      categoryId: null, brandId: null, costPrice: 100, sellPrice: 150, unitLabel: "piece",
      altUnitLabel: null, altUnitConversionFactor: null, altUnitSellPrice: null, expiryTracking: "off",
      expiryDate: null, lowStockThreshold: null, archived: false, version: 1, updatedAt: "2026-09-21T10:00:00.000Z",
    });
    await db.inventoryStock.put({ id: "test-business:product-a:main", businessId: "test-business", productId: "product-a", branchId: "main", quantity: 0, updatedAt: "2026-09-21T09:00:00.000Z" });
    await db.stockMovements.put({
      id: "opening-a", clientId: "opening-a", businessId: "test-business", productId: "product-a", branchId: "main",
      quantityDelta: 15, source: "initial_stock", sourceReferenceId: null, reasonCode: null,
      createdAtLocal: "2026-09-21T10:00:00.000Z", createdAt: "2026-09-21T10:00:00.000Z", createdByUserId: "owner",
    });
    await db.outbox.put({
      clientId: "opening-a", mutationId: "opening-a", idempotencyKey: "opening-a", entityId: "opening-a",
      businessId: "test-business", type: "stock_adjustment", operation: "append", status: "syncing", awaitingConfirmation: true,
      payload: { id: "opening-a", clientId: "opening-a", productId: "product-a", branchId: "main", quantityDelta: 15 },
      createdAtLocal: "2026-09-21T10:00:00.000Z", attemptCount: 0, lastError: null,
    });
    serverGet.mockRejectedValueOnce(new BackendRequestError(500, "INTERNAL_ERROR", "Internal server error"));

    const failed = await preloadSessionData(true, "push-success");

    expect(failed.fullySynced).toBe(false);
    expect(await getStockByProduct("main")).toEqual(new Map([["product-a", 15]]));
    expect(await db.inventoryStock.get("test-business:product-a:main")).toMatchObject({ quantity: 0 });
    expect(await db.outbox.get("opening-a")).toMatchObject({ status: "syncing", awaitingConfirmation: true });
    expect(await db.syncPullState.get("test-business:session")).toMatchObject({ lastPullErrorCode: "PULL_FAILED", lastPullHttpStatus: 500, cursor: null });

    serverGet.mockResolvedValueOnce({
      ok: true, businessId: "test-business", serverTime: "2026-09-21T10:01:00.000Z", cursor: "confirmed", nextCursor: null, hasMore: false,
      entities: [{ entity: "inventory", success: true, records: [{ product_id: "product-a", branch_id: "main", quantity: 15, updated_at: "2026-09-21T10:00:30.000Z" }], lastSuccessfulPullAt: "2026-09-21T10:01:00.000Z", error: null }],
    });
    const recovered = await preloadSessionData(true, "manual");

    expect(recovered.fullySynced).toBe(true);
    expect(await db.outbox.get("opening-a")).toBeUndefined();
    expect(await getStockByProduct("main")).toEqual(new Map([["product-a", 15]]));
  });

  it("backs off automatic pull triggers after HTTP 500", async () => {
    serverGet.mockRejectedValue(new BackendRequestError(500, "INTERNAL_ERROR", "Internal server error"));

    await preloadSessionData(true, "poll");
    await preloadSessionData(true, "poll");
    await preloadSessionData(true, "poll");

    expect(serverGet).toHaveBeenCalledTimes(1);
    expect(await db.syncPullState.get("test-business:session")).toMatchObject({ pullRetryCount: 1, lastPullHttpStatus: 500 });
  });
});
