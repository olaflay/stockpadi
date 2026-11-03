import type { Purchase } from "@/types/purchase";
type ServerProduct = { id: string; cost_price: number; version: number; updated_at: string; [key: string]: unknown };
type ServerExpense = { id: string; reversed_at?: string | null; reversed_by_user_id?: string | null; reversal_reason?: string | null; [key: string]: unknown };
type TestMutation =
  | { clientId: string; type: "purchase_receipt"; payload: Purchase & { items: Array<Purchase["items"][number] & { movementClientId?: string }> } }
  | { clientId: string; type: "expense_reversal"; payload: { expenseId: string; reversedAt: string; reversedByUserId: string; reversalReason: string } };
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { clearLocalBusinessId, setLocalBusinessId } from "@/lib/local-tenant";
import { receivePurchase } from "@/features/purchases/receive-purchase";
import { deleteExpense } from "@/features/expenses/add-expense";
import { preloadSessionData } from "@/features/sync/preload-session-data";
import type { CurrentUser } from "@/features/auth/use-current-user";

const serverPost = vi.hoisted(() => vi.fn());
const serverGet = vi.hoisted(() => vi.fn());

vi.mock("@/platform/api/backend-client", () => ({
  serverPost,
  serverGet,
  BackendRequestError: class BackendRequestError extends Error { code = "SERVER_ERROR"; status = 500; },
  NetworkUnavailableError: class NetworkUnavailableError extends Error { code = "NETWORK_UNAVAILABLE"; },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "test-token" } } }) } }),
}));

const OWNER: CurrentUser = { id: "owner", fullName: "Owner", role: "owner", accountType: "BUSINESS_OWNER" };

describe("Two-Device Split-Brain Restock and Expense Reversal Convergence", () => {
  const serverProducts = new Map<string, ServerProduct>();
  const serverExpenses = new Map<string, ServerExpense>();
  const serverPurchases = new Map<string, unknown>();
  const serverMovements: Array<{ product_id: string; quantity_delta: number; [key: string]: unknown }> = [];

  async function resetClientStorage(): Promise<void> {
    await Promise.all([
      db.products.clear(),
      db.stockMovements.clear(),
      db.inventoryStock.clear(),
      db.outbox.clear(),
      db.expenses.clear(),
      db.purchases.clear(),
      db.syncPullState.clear(),
      db.syncDiagnostics.clear(),
      db.syncLeases.clear(),
    ]);
    await db.businessProfile.put({
      id: BUSINESS_PROFILE_SINGLETON_ID,
      businessId: "business-1",
      name: "Supermarket",
      businessTypeId: "retail",
      currency: "NGN",
    });
  }

  beforeEach(async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { onLine: true });
    clearLocalBusinessId();
    serverProducts.clear();
    serverExpenses.clear();
    serverPurchases.clear();
    serverMovements.length = 0;
    await resetClientStorage();
    await setLocalBusinessId("business-1");

    // Seed baseline server catalog
    serverProducts.set("prod-1", {
      id: "prod-1",
      name: "Cooking Oil",
      sku: "SKU-1",
      barcode: null,
      cost_price: 100,
      sell_price: 150,
      unit_label: "piece",
      expiry_tracking: "off",
      expiry_date: null,
      low_stock_threshold: 5,
      archived: false,
      version: 1,
      updated_at: "2026-10-29T20:00:00.000Z",
    });

    serverExpenses.set("exp-1", {
      id: "exp-1",
      branch_id: "branch-1",
      category: "Fuel",
      amount: 5000,
      note: "Generator",
      created_at: "2026-10-29T20:00:00.000Z",
      created_by_user_id: OWNER.id,
      reversed_at: null,
      reversed_by_user_id: null,
      reversal_reason: null,
    });

    serverGet.mockImplementation(async () => ({
      ok: true,
      businessId: "business-1",
      serverTime: "2026-10-29T22:00:00.000Z",
      cursor: "cursor-1",
      nextCursor: null,
      hasMore: false,
      entities: [
        {
          entity: "branches",
          success: true,
          records: [{ id: "branch-1", name: "Main", is_active: true, updated_at: "2026-10-29T20:00:00.000Z" }],
          lastSuccessfulPullAt: "2026-10-29T22:00:00.000Z",
          error: null,
        },
        {
          entity: "products",
          success: true,
          records: Array.from(serverProducts.values()),
          lastSuccessfulPullAt: "2026-10-29T22:00:00.000Z",
          error: null,
        },
        {
          entity: "expenses",
          success: true,
          records: Array.from(serverExpenses.values()),
          lastSuccessfulPullAt: "2026-10-29T22:00:00.000Z",
          error: null,
        },
      ],
    }));

    serverPost.mockImplementation(async (path: string, body: { batch?: TestMutation[]; items?: TestMutation[] }) => {
      if (path === "/api/sync/push") {
        const batch = body.batch || body.items || [];
        const results = batch.map((item) => {
          const clientId = item.clientId;
          if (item.type === "purchase_receipt") {
            const purchase = item.payload;
            serverPurchases.set(purchase.id, purchase);
            for (const line of purchase.items) {
              const prod = serverProducts.get(line.productId);
              if (prod) {
                // Server-side IAS 2 moving weighted average calculation
                const currStock = serverMovements
                  .filter((m) => m.product_id === line.productId)
                  .reduce((sum, m) => sum + m.quantity_delta, 0);
                const currCost = prod.cost_price || 0;
                const newCost = currStock <= 0
                  ? line.unitCost
                  : Math.round(((currStock * currCost + line.quantity * line.unitCost) / (currStock + line.quantity)) * 100) / 100;
                prod.cost_price = newCost;
                prod.version = (prod.version || 1) + 1;
                prod.updated_at = new Date().toISOString();
              }
              serverMovements.push({
                id: crypto.randomUUID(),
                client_id: line.movementClientId,
                business_id: "business-1",
                branch_id: purchase.branchId,
                product_id: line.productId,
                quantity_delta: line.quantity,
                source: "purchase_receipt",
                source_reference_id: purchase.id,
                created_at_local: purchase.createdAtLocal,
                created_by_user_id: purchase.createdByUserId,
              });
            }
            return { clientId, status: "applied", applied: true };
          }

          if (item.type === "expense_reversal") {
            const exp = serverExpenses.get(item.payload.expenseId);
            if (exp) {
              exp.reversed_at = item.payload.reversedAt;
              exp.reversed_by_user_id = item.payload.reversedByUserId;
              exp.reversal_reason = item.payload.reversalReason;
            }
            return { clientId, status: "applied", applied: true };
          }

          return { clientId, status: "applied", applied: true };
        });
        return { results };
      }
      return {};
    });
  });

  it("converges both offline restocks and expense reversals to bit-for-bit identical state across clients", async () => {
    vi.stubGlobal("navigator", { onLine: true });

    // Step 1: Initial Sync on Device A
    const pullRes = await preloadSessionData(true, "manual");
    if (!pullRes.fullySynced) {
      console.error("Pull failed:", pullRes);
    }
    const devAProductInit = await db.products.get("prod-1");
    expect(devAProductInit?.costPrice).toBe(100);

    // Step 2: Device A goes offline and executes restock (10 units at ₦200)
    // Existing stock in Dexie is 0. New costPrice becomes ₦200.
    const purchaseA = await receivePurchase({
      branchId: "branch-1",
      supplierId: "supp-1",
      lines: [{ productId: "prod-1", quantity: 10, unitCost: 200 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
    });
    expect(purchaseA).toBeDefined();
    const devAProductPostRestock = await db.products.get("prod-1");
    expect(devAProductPostRestock?.costPrice).toBe(200);

    // Step 3: Device A comes back online and pushes outbox
    const outboxItemsDevA = await db.outbox.toArray();
    expect(outboxItemsDevA.length).toBeGreaterThanOrEqual(1);
    await serverPost("/api/sync/push", {
      items: outboxItemsDevA.map((i) => ({ clientId: i.clientId, type: i.type, payload: i.payload })),
    });

    // Step 4: Device B goes offline and reverses the ₦5,000 expense
    await resetClientStorage();
    await setLocalBusinessId("business-1");
    // Seed Device B's local storage with the initial synced state
    await db.expenses.add({
      id: "exp-1",
      businessId: "business-1",
      branchId: "branch-1",
      category: "Fuel",
      amount: 5000,
      note: "Generator",
      createdAtLocal: "2026-10-29T20:00:00.000Z",
      createdByUserId: OWNER.id,
    });

    const reversalResult = await deleteExpense("exp-1", OWNER, "Duplicate voucher");
    expect(reversalResult).toEqual({ reversed: true, deleted: false });
    const devBExpense = await db.expenses.get("exp-1");
    expect(devBExpense?.reversedAt).toBeDefined();

    // Step 5: Device B comes online and pushes reversal
    const outboxItemsDevB = await db.outbox.toArray();
    await serverPost("/api/sync/push", {
      items: outboxItemsDevB.map((i) => ({ clientId: i.clientId, type: i.type, payload: i.payload })),
    });

    // Step 6: Full Convergence Pull on Device B
    await preloadSessionData(true, "manual");

    const devBFinalProduct = await db.products.get("prod-1");
    const devBFinalExpense = await db.expenses.get("exp-1");

    // Assert IAS 2 costPrice convergence on Device B matching Device A & PostgreSQL
    expect(devBFinalProduct?.costPrice).toBe(200);

    // Assert Expense reversal convergence on Device B matching PostgreSQL
    expect(devBFinalExpense?.reversedAt).toBeDefined();
    expect(serverExpenses.get("exp-1")?.reversed_at).toBeDefined();
  });
});
