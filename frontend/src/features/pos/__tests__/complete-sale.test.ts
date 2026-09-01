import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { completeSale, type CartLine } from "@/features/pos/complete-sale";
import { getCurrentStock } from "@/features/inventory/stock";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { SalePayment } from "@/types/sale";

/**
 * completeSale is the highest-stakes write path in the app: it's the only
 * function that writes a sale, its stock movements, and its credit
 * movement in one transaction. See .agents/rules/offline-sync-and-ledger.md
 * and .agents/rules/payment-and-pci-scope.md.
 */

const BRANCH_ID = "branch-1";
const PRODUCT_ID = "product-1";
const CASHIER: CurrentUser = { id: "user-cashier", fullName: "Cashier", role: "cashier" };
const INVENTORY_STAFF: CurrentUser = { id: "user-inv", fullName: "Inventory", role: "inventory_staff" };

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

describe("completeSale", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.stockMovements.clear();
    await db.customerCreditMovements.clear();
    await db.outbox.clear();

    // Seed initial stock (100 units) to prevent negative stock errors on checkout
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
      createdByUserId: "admin",
    });
  });

  it("writes the sale, a matching stock movement, and one outbox entry for a cash sale", async () => {
    const sale = await completeSale({
      branchId: BRANCH_ID,
      customerId: null,
      payments: [{ method: "cash", amount: 1000 }],
      lines: [line()],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(sale.total).toBe(1000);
    expect(await db.sales.get(sale.id)).toBeDefined();
    // 100 seeded - 2 sold = 98 remaining
    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(98);

    const outboxEntries = await db.outbox.where("clientId").equals(sale.id).toArray();
    expect(outboxEntries).toHaveLength(1);
    expect(outboxEntries[0].type).toBe("sale");

    expect(await db.customerCreditMovements.count()).toBe(0);
  });

  it("moves stock by the base-unit quantity, not the sold-unit quantity", async () => {
    // Sold by the carton (conversionFactor 12): 2 cartons should move 24 base units.
    await completeSale({
      branchId: BRANCH_ID,
      customerId: null,
      payments: [{ method: "cash", amount: 2000 }],
      lines: [line({ quantity: 2, unitLabel: "carton", conversionFactor: 12, unitPrice: 1000 })],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    // 100 seeded - 24 sold = 76 remaining
    expect(await getCurrentStock(PRODUCT_ID, BRANCH_ID)).toBe(76);
  });

  it("records only the credit-tagged portion of a split payment as customer debt", async () => {
    const customerId = "customer-1";
    const payments: SalePayment[] = [
      { method: "cash", amount: 400 },
      { method: "credit", amount: 600 },
    ];

    const sale = await completeSale({
      branchId: BRANCH_ID,
      customerId,
      payments,
      lines: [line({ unitPrice: 500, quantity: 2 })],
      createdByUserId: CASHIER.id,
      actor: CASHIER,
    });

    expect(sale.total).toBe(1000);
    expect(await getCustomerCreditBalance(customerId)).toBe(600);

    const creditMovements = await db.customerCreditMovements.where("customerId").equals(customerId).toArray();
    expect(creditMovements).toHaveLength(1);
    expect(creditMovements[0].sourceReferenceId).toBe(sale.id);
  });

  it("refuses a credit payment with no customer attached, and writes nothing", async () => {
    await expect(
      completeSale({
        branchId: BRANCH_ID,
        customerId: null,
        payments: [{ method: "credit", amount: 1000 }],
        lines: [line()],
        createdByUserId: CASHIER.id,
        actor: CASHIER,
      })
    ).rejects.toThrow("A credit payment requires a customer to be recorded.");

    expect(await db.sales.count()).toBe(0);
    // 1 seeded stock movement exists, no new sale movements written
    expect(await db.stockMovements.count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("keeps the offline write path backend-authorized", async () => {
    await completeSale({
        branchId: BRANCH_ID,
        customerId: null,
        payments: [{ method: "cash", amount: 1000 }],
        lines: [line()],
        createdByUserId: INVENTORY_STAFF.id,
        actor: INVENTORY_STAFF,
      });

    expect(await db.sales.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it("rejects a zero or negative payment line locally, before it could strand the sale in the outbox forever", async () => {
    const cases: SalePayment[][] = [
      [{ method: "cash", amount: 0 }],
      [{ method: "cash", amount: -500 }],
      [{ method: "cash", amount: 1000 }, { method: "transfer", amount: 0 }],
    ];
    for (const payments of cases) {
      await expect(
        completeSale({ branchId: BRANCH_ID, customerId: null, payments, lines: [line()], createdByUserId: CASHIER.id, actor: CASHIER })
      ).rejects.toThrow("Every payment line must have a positive amount.");
    }
    expect(await db.sales.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it("rejects a zero or negative line quantity and a negative unit price, writing nothing", async () => {
    await expect(
      completeSale({ branchId: BRANCH_ID, customerId: null, payments: [{ method: "cash", amount: 1000 }], lines: [line({ quantity: 0 })], createdByUserId: CASHIER.id, actor: CASHIER })
    ).rejects.toThrow("Every line needs a quantity greater than zero.");
    await expect(
      completeSale({ branchId: BRANCH_ID, customerId: null, payments: [{ method: "cash", amount: 1000 }], lines: [line({ quantity: -2 })], createdByUserId: CASHIER.id, actor: CASHIER })
    ).rejects.toThrow("Every line needs a quantity greater than zero.");
    await expect(
      completeSale({ branchId: BRANCH_ID, customerId: null, payments: [{ method: "cash", amount: 1000 }], lines: [line({ unitPrice: -10 })], createdByUserId: CASHIER.id, actor: CASHIER })
    ).rejects.toThrow("A line cannot have a negative price.");

    expect(await db.sales.count()).toBe(0);
    expect(await db.stockMovements.count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });
});
