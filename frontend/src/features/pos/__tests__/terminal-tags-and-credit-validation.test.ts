import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { completeSale, type CartLine } from "@/features/pos/complete-sale";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { SalePayment } from "@/types/sale";

const BRANCH_ID = "branch-1";
const PRODUCT_ID = "product-1";
const CASHIER: CurrentUser = {
  id: "user-cashier",
  fullName: "Cashier",
  role: "cashier",
  accountType: "WORKER",
  permissions: ["POS_SELL", "USE_CUSTOMER_CREDIT"],
};

function line(): CartLine {
  return {
    productId: PRODUCT_ID,
    quantity: 1,
    unitPrice: 2000,
    unitLabel: "piece",
    conversionFactor: 1,
  };
}

describe("POS Terminal Tagging & Credit Sale Validation", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.stockMovements.clear();
    await db.customerCreditMovements.clear();
    await db.outbox.clear();
    await db.customers.clear();

    await db.stockMovements.add({
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId: BRANCH_ID,
      productId: PRODUCT_ID,
      quantityDelta: 50,
      source: "purchase_receipt",
      sourceReferenceId: "seed",
      reasonCode: null,
      createdByUserId: "seed-user",
      businessId: "test-business",
      createdAt: new Date().toISOString(),
      createdAtLocal: new Date().toISOString(),
    });
  });

  it("stores custom POS terminal account tags in the sale payment note for daily settlement reconciliation", async () => {
    const terminalPayment: SalePayment = {
      method: "pos_terminal",
      amount: 2000,
      note: "Moniepoint POS · Counter 1",
    };

    const sale = await completeSale({
      branchId: BRANCH_ID,
      customerId: null,
      lines: [line()],
      payments: [terminalPayment],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(sale.payments).toHaveLength(1);
    expect(sale.payments[0].method).toBe("pos_terminal");
    expect(sale.payments[0].note).toBe("Moniepoint POS · Counter 1");

    const saved = await db.sales.get(sale.id);
    expect(saved?.payments[0].note).toBe("Moniepoint POS · Counter 1");
  });

  it("allows completing credit sales when customer ID is provided", async () => {
    const customerId = "cust-1";
    await db.customers.add({
      id: customerId,
      name: "Chukwudi Eze",
      phone: "08031234567",
      businessId: "test-business",
      updatedAt: new Date().toISOString(),
    });

    const creditPayment: SalePayment = {
      method: "credit",
      amount: 2000,
    };

    const sale = await completeSale({
      branchId: BRANCH_ID,
      customerId,
      lines: [line()],
      payments: [creditPayment],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(sale.customerId).toBe(customerId);
    const creditMovements = await db.customerCreditMovements.toArray();
    expect(creditMovements).toHaveLength(1);
    expect(creditMovements[0].amountDelta).toBe(2000);
    expect(creditMovements[0].customerId).toBe(customerId);
  });
});
