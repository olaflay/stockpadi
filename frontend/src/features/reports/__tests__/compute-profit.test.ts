import { describe, it, expect } from "vitest";
import {
  computeGrossProfit,
  computeCogs,
  computeNetProfit,
  computeNetCashFlow,
} from "../compute-profit";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";

describe("computeGrossProfit and computeCogs", () => {
  const products: Product[] = [
    {
      id: "prod-1",
      name: "Product 1",
      costPrice: 300,
      sellPrice: 500,
      sku: "P1",
      barcode: null,
      brandId: null,
      categoryId: null,
      unitLabel: "piece",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: 5,
      version: 1,
      updatedAt: new Date().toISOString(),
    },
  ];

  it("calculates gross profit and COGS correctly with item and sale discounts", () => {
    const sales: Sale[] = [
      {
        id: "sale-1",
        clientId: "client-sale-1",
        branchId: "b-1",
        customerId: null,
        items: [
          {
            productId: "prod-1",
            quantity: 2,
            unitPrice: 500,
            discount: 50, // 450 each
            unitLabel: "piece",
            conversionFactor: 1,
            movementClientId: "move-1",
          },
        ],
        payments: [{ method: "cash", amount: 800 }],
        subtotal: 900,
        discount: 100, // order-level discount
        total: 800,
        createdAt: new Date().toISOString(),
        createdAtLocal: new Date().toISOString(),
        createdByUserId: "user-1",
        voidedAt: null,
      },
    ];

    // COGS = 2 * 300 = 600
    const cogs = computeCogs(sales, products);
    expect(cogs).toBe(600);

    // Revenue = 800. Gross Profit = 800 - 600 = 200
    const grossProfit = computeGrossProfit(sales, products);
    expect(grossProfit).toBe(200);

    // Net profit = 200 - 50 = 150
    const expenses: Expense[] = [
      {
        id: "exp-test",
        branchId: "b-1",
        category: "Rent",
        amount: 50,
        note: null,
        createdAtLocal: new Date().toISOString(),
        createdByUserId: "user-1",
      },
    ];
    const netProfit = computeNetProfit(grossProfit, expenses);
    expect(netProfit).toBe(150);

    // Mathematical reconciliation: Revenue - COGS === Gross Profit
    const revenue = sales.reduce((sum, s) => sum + s.total, 0);
    expect(revenue - cogs).toBe(grossProfit);
  });
});

describe("computeNetCashFlow with mixed payments", () => {
  it("includes non-credit portion of mixed-payment sales in cash flow", () => {
    const sales: Sale[] = [
      {
        id: "sale-mixed",
        clientId: "client-sale-mixed",
        branchId: "b-1",
        customerId: null,
        items: [],
        payments: [
          { method: "cash", amount: 9000 },
          { method: "credit", amount: 1000 },
        ],
        subtotal: 10000,
        discount: 0,
        total: 10000,
        createdAt: new Date().toISOString(),
        createdAtLocal: new Date().toISOString(),
        createdByUserId: "user-1",
        voidedAt: null,
      },
    ];

    const expenses: Expense[] = [
      {
        id: "exp-1",
        branchId: "b-1",
        category: "Supplies",
        amount: 2000,
        note: null,
        createdAtLocal: new Date().toISOString(),
        createdByUserId: "user-1",
      },
    ];

    const purchases: Purchase[] = [];
    const creditCollected = 500;

    // Cash Sales = 9,000 (NOT dropped to 0!)
    // Expenses = 2,000
    // Purchases = 0
    // Credit Collected = 500
    // Net Cash Flow = 9,000 - 2,000 - 0 + 500 = 7,500
    const netCashFlow = computeNetCashFlow(sales, expenses, purchases, creditCollected);
    expect(netCashFlow).toBe(7500);
  });
});
