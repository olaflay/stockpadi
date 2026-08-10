import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { completeSale, type CartLine } from "@/features/pos/complete-sale";
import { voidSale } from "@/features/pos/void-sale";
import { getCurrentStock } from "@/features/inventory/stock";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import type { CurrentUser } from "@/features/auth/use-current-user";

const BRANCH_ID = "branch-1";
const PRODUCT_ID = "product-1";
const CUSTOMER_ID = "customer-1";
const MANAGER: CurrentUser = { id: "user-manager", fullName: "Manager", role: "manager" };
const CASHIER: CurrentUser = { id: "user-cashier", fullName: "Cashier", role: "cashier" };

vi.mock("@/lib/supabase", () => {
  return {
    getSupabase: () => ({
      auth: {
        getSession: async () => ({
          data: {
            session: {
              access_token: "mock-token",
              user: { id: "user-manager" },
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
    unitPrice: 500,
    unitLabel: "piece",
    conversionFactor: 1,
    ...overrides,
  };
}

describe("voidSale", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.stockMovements.clear();
    await db.customerCreditMovements.clear();
    await db.outbox.clear();

    // Mock fetch for the Edge Function endpoint call
    vi.stubGlobal("fetch", async () => {
      return {
        ok: true,
        json: async () => ({ status: "ok" }),
      };
    });

    // Seed stock
    await db.stockMovements.add({
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityDelta: 100,
      source: "purchase_receipt",
      sourceReferenceId: "seed",
      reasonCode: null,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: MANAGER.id,
    });
  });

  it("reverses stock movements and marks sale as voided", async () => {
    // 1. Process sale
    const sale = await completeSale({
      branchId: BRANCH_ID,
      customerId: null,
      payments: [{ method: "cash", amount: 1000 }],
      lines: [line()],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(98);

    // 2. Void sale
    await voidSale({
      saleId: sale.id,
      branchId: BRANCH_ID,
      reason: "Customer changed mind",
    });

    // 3. Assert sale is voided locally
    const updatedSale = await db.sales.get(sale.id);
    expect(updatedSale?.voidedAt).toBeDefined();

    // 4. Assert stock is restored to 100
    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(100);

    // 5. Assert reversal stock movement exists
    const reversals = await db.stockMovements
      .filter((m) => m.source === "sale_void")
      .toArray();
    expect(reversals).toHaveLength(1);
    expect(reversals[0].quantityDelta).toBe(2);
    expect(reversals[0].sourceReferenceId).toBe(sale.id);
  });

  it("reverses customer credit movements when a credit sale is voided", async () => {
    // 1. Process split-payment sale with credit
    const sale = await completeSale({
      branchId: BRANCH_ID,
      customerId: CUSTOMER_ID,
      payments: [
        { method: "cash", amount: 400 },
        { method: "credit", amount: 600 },
      ],
      lines: [line()],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(await getCustomerCreditBalance(CUSTOMER_ID)).toBe(600);

    // 2. Void sale
    await voidSale({
      saleId: sale.id,
      branchId: BRANCH_ID,
      reason: "Void debt",
    });

    // 3. Assert customer debt balance returns to 0
    expect(await getCustomerCreditBalance(CUSTOMER_ID)).toBe(0);

    // 4. Assert reversal credit movement exists in IndexedDB
    const creditMovements = await db.customerCreditMovements
      .where("customerId")
      .equals(CUSTOMER_ID)
      .toArray();
    
    // Original (600) + Reversal (-600) = 2 movements
    expect(creditMovements).toHaveLength(2);
    const reversal = creditMovements.find((m) => m.amountDelta < 0);
    expect(reversal).toBeDefined();
    expect(reversal?.amountDelta).toBe(-600);
    expect(reversal?.sourceReferenceId).toBe(sale.id);
  });
});
