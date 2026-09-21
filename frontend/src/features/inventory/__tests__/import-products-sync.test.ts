import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { clearLocalBusinessId, setLocalBusinessId } from "@/lib/local-tenant";
import { importProducts } from "@/features/inventory/import-products";
import { IMPORT_HEADERS, parseProductFile, type ParsedImportRow } from "@/features/inventory/product-import";
import type { CurrentUser } from "@/features/auth/use-current-user";

const serverPost = vi.hoisted(() => vi.fn());
const serverGet = vi.hoisted(() => vi.fn());
const mockSession = vi.hoisted(() => ({ access_token: "test-token" }));

vi.mock("@/features/operations/server-client", () => ({
  serverPost,
  serverGet,
  BackendRequestError: class BackendRequestError extends Error { code = "SERVER_ERROR"; status = 500; },
  NetworkUnavailableError: class NetworkUnavailableError extends Error { code = "NETWORK_UNAVAILABLE"; },
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: mockSession } }) } }),
}));

const OWNER: CurrentUser = {
  id: "owner-1",
  fullName: "Owner",
  role: "owner",
  accountType: "BUSINESS_OWNER",
};

function xlsxRows(): Array<Array<string | number>> {
  return Array.from({ length: 5 }, (_, index) => [
    `Imported Product ${index + 1}`,
    `IMPORT-${index + 1}`,
    "",
    100 + index,
    150 + index,
    "piece",
    2,
    "off",
    "",
    10 + index,
  ]);
}

async function makeWorkbook(): Promise<File> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.addRow([...IMPORT_HEADERS]);
  for (const row of xlsxRows()) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], "import-products-regression.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function productRows(): ParsedImportRow[] {
  return xlsxRows().map((row, index) => ({
    rowNum: index + 2,
    hasInitialStock: true,
    initialStockQty: Number(row[9]),
    data: {
      name: String(row[0]), sku: String(row[1]), barcode: "", costPrice: Number(row[3]), sellPrice: Number(row[4]),
      unitLabel: "piece", altUnitLabel: "", altUnitConversionFactor: undefined, altUnitSellPrice: undefined,
      expiryTracking: "off", expiryDate: "", lowStockThreshold: 2,
    },
  }));
}

describe("CSV/XLSX import sync regression", () => {
  beforeEach(async () => {
    clearLocalBusinessId();
    await Promise.all([
      db.businessProfile.clear(), db.branches.clear(), db.products.clear(), db.stockMovements.clear(),
      db.outbox.clear(), db.inventoryStock.clear(), db.syncDiagnostics.clear(), db.syncPullState.clear(),
      db.localUsers.clear(), db.session.clear(),
    ]);
    await setLocalBusinessId("business-a");
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: false });
    serverPost.mockReset();
    serverGet.mockReset();
  });

  it("parses five XLSX products and atomically queues products plus Branch A opening stock", async () => {
    const parsed = await parseProductFile(await makeWorkbook());
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.validRows).toHaveLength(5);

    await importProducts(parsed.validRows, OWNER, "branch-a");

    const products = await db.products.toArray();
    const movements = await db.stockMovements.toArray();
    const queued = await db.outbox.orderBy("sequence").toArray();
    expect(products).toHaveLength(5);
    expect(products.every((product) => product.businessId === "business-a" && product.categoryId === null)).toBe(true);
    expect(movements).toHaveLength(5);
    expect(movements.every((movement) => movement.businessId === "business-a" && movement.branchId === "branch-a")).toBe(true);
    expect(queued).toHaveLength(10);
    expect(queued.slice(0, 5).every((item) => item.type === "product")).toBe(true);
    expect(queued.slice(5).every((item) => item.type === "stock_adjustment")).toBe(true);
    for (const item of queued.slice(5)) {
      expect(item.dependsOn).toEqual(["branch-a", item.payload && (item.payload as { productId: string }).productId]);
    }
  }, 120000);

  it("pushes the five products before their opening stock, then applies the worker pull without a reload", async () => {
    await importProducts(productRows(), OWNER, "branch-a");
    const pushBatches: string[][] = [];
    serverPost.mockImplementation(async (path: string, body: { batch?: Array<{ type: string; client_id: string }> }) => {
      if (path === "/api/account-context") return { accountType: "BUSINESS_OWNER", businessId: "business-a", businessStatus: "verified", permissions: [], branchIds: ["branch-a"] };
      if (path === "/api/sync/push") {
        const batch = body.batch ?? [];
        pushBatches.push(batch.map((item) => item.type));
        return { results: batch.map((item) => ({ status: "applied", clientId: item.client_id, mutationId: item.client_id })) };
      }
      throw new Error(`unexpected server POST ${path}`);
    });

    const { drainOutbox } = await import("@/features/sync/drain-outbox");
    const pushed = await drainOutbox();
    expect(pushed.pendingRemaining).toBe(0);
    expect(pushBatches).toEqual([Array(5).fill("product"), Array(5).fill("stock_adjustment")]);

    await db.products.clear();
    await db.inventoryStock.clear();
    await db.businessProfile.put({ id: "singleton", businessId: "business-a", name: "Store", businessTypeId: "retail", currency: "NGN" });
    vi.stubGlobal("navigator", { onLine: true });
    serverGet.mockResolvedValue({
      ok: true,
      businessId: "business-a",
      serverTime: "2026-09-20T12:00:00.000Z",
      cursor: "complete-worker-pull",
      nextCursor: null,
      hasMore: false,
      entities: [
        { entity: "products", success: true, records: productRows().map((row, index) => ({ id: `product-${index + 1}`, name: row.data.name, sku: row.data.sku, cost_price: row.data.costPrice, sell_price: row.data.sellPrice, unit_label: row.data.unitLabel, expiry_tracking: "off", expiry_date: null, low_stock_threshold: row.data.lowStockThreshold, archived: false, version: 1, updated_at: "2026-09-20T11:59:00.000Z" })), lastSuccessfulPullAt: "2026-09-20T12:00:00.000Z", error: null },
        { entity: "inventory", success: true, records: productRows().map((row, index) => ({ product_id: `product-${index + 1}`, branch_id: "branch-a", quantity: row.initialStockQty, updated_at: "2026-09-20T11:59:00.000Z" })), lastSuccessfulPullAt: "2026-09-20T12:00:00.000Z", error: null },
      ],
    });
    const { preloadSessionData } = await import("@/features/sync/preload-session-data");
    const pull = await preloadSessionData(true, "auth");
    expect(pull.fullySynced).toBe(true);
    expect(await db.products.count()).toBe(5);
    expect(await db.inventoryStock.count()).toBe(5);
    expect((await db.inventoryStock.toArray()).every((stock) => stock.branchId === "branch-a")).toBe(true);
  }, 20000);
});
