import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { completeSale, type CartLine } from "@/features/pos/complete-sale";
import { refundSale, RefundSaleError } from "@/features/pos/refund-sale";
import { getCurrentStock } from "@/features/inventory/stock";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import type { CurrentUser } from "@/features/auth/use-current-user";

const BRANCH_ID = "branch-1";
const PRODUCT_ID = "product-1";
const CUSTOMER_ID = "customer-1";
const OWNER: CurrentUser = {
  id: "user-owner",
  fullName: "Store Owner",
  role: "owner",
  accountType: "BUSINESS_OWNER",
};

vi.mock("@/lib/supabase", () => {
  return {
    getSupabase: () => ({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: "mock-token",
              user: { id: "user-owner" },
            },
          },
        }),
      },
    }),
  };
});

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: PRODUCT_ID,
    quantity: 2,
    unitPrice: 1000,
    unitLabel: "piece",
    conversionFactor: 1,
    ...overrides,
  };
}

describe("refundSale client", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.stockMovements.clear();
    await db.customerCreditMovements.clear();
    await db.saleRefunds.clear();
    await db.outbox.clear();

    // Mock fetch for the backend endpoint
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body ?? "{}")) as { items?: Array<{ productId: string; quantity: number }>; payments?: Array<{ method: string; amount: number }> };
      return {
        ok: true,
        json: async () => ({
          status: "ok",
          refundId: "refund-uuid-1",
          totalRefunded: 1000,
          restoredStock: 1,
          items: (request.items ?? []).map((item) => ({ ...item, unitPrice: 1000, total: item.quantity * 1000 })),
          payments: request.payments ?? [],
        }),
      };
    });

    // Seed stock: 10 in stock
    await db.stockMovements.add({
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityDelta: 10,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "init",
    });
  });

  it("rejects when reason is empty", async () => {
    await expect(
      refundSale({
        clientRefundId: crypto.randomUUID(),
        saleId: "sale-1",
        branchId: BRANCH_ID,
        reason: "   ",
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
        payments: [{ method: "cash", amount: 1000 }],
      })
    ).rejects.toThrow(RefundSaleError);
  });

  it("atomically restores local stock when refund completes", async () => {
    // 1. Sell 2 units (stock drops from 10 to 8)
    const sale = await completeSale({
      branchId: BRANCH_ID,
      lines: [line({ quantity: 2, unitPrice: 1000 })],
      payments: [{ method: "cash", amount: 2000 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
      customerId: null,
    });

    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(8);

    // 2. Refund 1 unit @ 1000 cash
    const result = await refundSale({
      clientRefundId: crypto.randomUUID(),
      saleId: sale.id,
      branchId: BRANCH_ID,
      reason: "Customer returned 1 damaged unit",
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      payments: [{ method: "cash", amount: 1000 }],
    });

    expect(result.status).toBe("ok");
    expect(result.restoredStock).toBe(1);

    // Stock should now be 9 (8 + 1)
    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(9);
  });

  it("reduces customer debt balance when credit refund is processed", async () => {
    // 1. Sell 2 units on credit (customer credit balance becomes +2000 debt)
    const sale = await completeSale({
      branchId: BRANCH_ID,
      lines: [line({ quantity: 2, unitPrice: 1000 })],
      payments: [{ method: "credit", amount: 2000 }],
      createdByUserId: OWNER.id,
      actor: OWNER,
      customerId: CUSTOMER_ID,
    });

    expect(await getCustomerCreditBalance(CUSTOMER_ID)).toBe(2000);

    // 2. Refund 1 unit @ 1000 credit
    await refundSale({
      clientRefundId: crypto.randomUUID(),
      saleId: sale.id,
      branchId: BRANCH_ID,
      reason: "Item returned, debt reduced",
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      payments: [{ method: "credit", amount: 1000 }],
    });

    // Customer balance should drop from 2000 to 1000
    expect(await getCustomerCreditBalance(CUSTOMER_ID)).toBe(1000);
  });
});
