import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { clearLocalBusinessId, setLocalBusinessId } from "@/lib/local-tenant";
import { importProducts } from "@/features/inventory/import-products";
import { getStockByProduct } from "@/features/inventory/product-insights";
import { completeSale } from "@/features/pos/complete-sale";
import { writeStockAdjustment } from "@/features/inventory/write-stock-adjustment";
import { preloadSessionData } from "@/features/sync/preload-session-data";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { ParsedImportRow } from "@/features/inventory/product-import";

const serverPost = vi.hoisted(() => vi.fn());
const serverGet = vi.hoisted(() => vi.fn());

vi.mock("@/features/operations/server-client", () => ({
  serverPost,
  serverGet,
  BackendRequestError: class BackendRequestError extends Error { code = "SERVER_ERROR"; status = 500; },
  NetworkUnavailableError: class NetworkUnavailableError extends Error { code = "NETWORK_UNAVAILABLE"; },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "test-token" } } }) } }),
}));

const OWNER: CurrentUser = { id: "owner", fullName: "Owner", role: "owner", accountType: "BUSINESS_OWNER" };
const WORKER: CurrentUser = { id: "worker", fullName: "Worker", role: "cashier", accountType: "WORKER", branchIds: ["main"], permissions: ["POS_SELL"] };

function productRow(): ParsedImportRow {
  return {
    rowNum: 2,
    hasInitialStock: true,
    initialStockQty: 15,
    data: { name: "Product A", sku: "PRODUCT-A", barcode: "", costPrice: 100, sellPrice: 150, unitLabel: "piece", altUnitLabel: "", altUnitConversionFactor: undefined, altUnitSellPrice: undefined, expiryTracking: "off", expiryDate: "", lowStockThreshold: undefined },
  };
}

describe("owner and worker stock convergence", () => {
  const serverProducts = new Map<string, Record<string, unknown>>();
  const serverStock = new Map<string, number>();
  const stockKey = (productId: string, branchId: string) => `${productId}:${branchId}`;

  async function freshDevice(): Promise<void> {
    await Promise.all([
      db.products.clear(), db.stockMovements.clear(), db.inventoryStock.clear(), db.outbox.clear(), db.sales.clear(), db.purchases.clear(), db.syncPullState.clear(), db.syncDiagnostics.clear(),
    ]);
    await db.businessProfile.put({ id: BUSINESS_PROFILE_SINGLETON_ID, businessId: "business-a", name: "Store", businessTypeId: "retail", currency: "NGN" });
  }

  async function pull(trigger: "auth" | "push-success" | "manual"): Promise<void> {
    vi.stubGlobal("navigator", { onLine: true });
    const result = await preloadSessionData(true, trigger);
    expect(result.fullySynced).toBe(true);
  }

  beforeEach(async () => {
    clearLocalBusinessId();
    serverProducts.clear();
    serverStock.clear();
    await freshDevice();
    await setLocalBusinessId("business-a");
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: false });
    serverPost.mockReset();
    serverGet.mockReset();
    serverPost.mockImplementation(async (path: string, body: { batch?: Array<{ client_id: string; type: string; payload: Record<string, unknown> }> }) => {
      if (path === "/api/sync/push") {
        const batch = body.batch ?? [];
        for (const item of batch) {
          if (item.type === "product") serverProducts.set(String(item.payload.id), item.payload);
          if (item.type === "stock_adjustment") {
            const key = stockKey(String(item.payload.productId), String(item.payload.branchId));
            serverStock.set(key, (serverStock.get(key) ?? 0) + Number(item.payload.quantityDelta));
          }
          if (item.type === "sale") {
            const branchId = String(item.payload.branchId);
            for (const saleItem of (item.payload.items as Array<Record<string, unknown>>)) {
              const key = stockKey(String(saleItem.productId), branchId);
              serverStock.set(key, (serverStock.get(key) ?? 0) - Number(saleItem.quantity) * Number(saleItem.conversionFactor));
            }
          }
        }
        return { results: batch.map((item) => ({ clientId: item.client_id, mutationId: item.client_id, status: "applied", version: item.type === "product" ? 1 : undefined })) };
      }
      throw new Error(`Unexpected POST ${path}`);
    });
    serverGet.mockImplementation(async () => ({
      ok: true,
      businessId: "business-a",
      serverTime: "2026-09-21T12:00:00.000Z",
      cursor: `complete-${serverStock.size}`,
      nextCursor: null,
      hasMore: false,
      entities: [
        {
          entity: "products",
          success: true,
          records: [...serverProducts.entries()].map(([id, product]) => ({
            id, name: product.name, sku: product.sku, barcode: product.barcode ?? null, category_id: null, brand_id: null,
            cost_price: product.costPrice, sell_price: product.sellPrice, unit_label: product.unitLabel, expiry_tracking: "off", expiry_date: null,
            low_stock_threshold: null, archived: false, version: 1, updated_at: "2026-09-21T11:59:00.000Z",
          })),
          lastSuccessfulPullAt: "2026-09-21T12:00:00.000Z", error: null,
        },
        {
          entity: "inventory",
          success: true,
          records: [...serverStock.entries()].map(([key, quantity]) => {
            const [product_id, branch_id] = key.split(":");
            return { product_id, branch_id, quantity, updated_at: "2026-09-21T11:59:30.000Z" };
          }),
          lastSuccessfulPullAt: "2026-09-21T12:00:00.000Z", error: null,
        },
      ],
    }));
  });

  it("keeps 15 after owner sync, converges a worker sale to 13, then converges owner restock to 18", async () => {
    await importProducts([productRow()], OWNER, "main");
    const product = (await db.products.toArray())[0];
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 15]]));

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    await drainOutbox();
    expect(serverStock.get(stockKey(product.id, "main"))).toBe(15);
    expect((await db.outbox.toArray()).some((item) => item.status === "syncing" && item.awaitingConfirmation)).toBe(true);
    await pull("push-success");
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 15]]));

    await freshDevice();
    await pull("auth");
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 15]]));

    vi.stubGlobal("navigator", { onLine: false });
    await completeSale({ branchId: "main", customerId: null, payments: [{ method: "cash", amount: 300 }], lines: [{ productId: product.id, quantity: 2, unitPrice: 150, unitLabel: "piece", conversionFactor: 1 }], createdByUserId: WORKER.id, actor: WORKER });
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 13]]));
    await drainOutbox();
    expect(serverStock.get(stockKey(product.id, "main"))).toBe(13);
    await pull("push-success");
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 13]]));

    await freshDevice();
    await pull("auth");
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 13]]));

    vi.stubGlobal("navigator", { onLine: false });
    await writeStockAdjustment({ branchId: "main", productId: product.id, countedQuantity: 18, reasonCode: "other", note: "Restock", createdByUserId: OWNER.id, actor: OWNER });
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 18]]));
    await drainOutbox();
    expect(serverStock.get(stockKey(product.id, "main"))).toBe(18);
    await pull("push-success");

    await freshDevice();
    await pull("auth");
    expect(await getStockByProduct("main")).toEqual(new Map([[product.id, 18]]));
  });
});
