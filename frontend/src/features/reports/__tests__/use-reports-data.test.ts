// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db";
import { useReportsData } from "@/features/reports/use-reports-data";
import { LOW_STOCK_THRESHOLD } from "@/features/inventory/product-insights";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { StockMovement } from "@/types/stock-movement";

/**
 * useReportsData extracted from reports/page.tsx: period selection plus
 * the derived totals/best-sellers/low-stock lists the presentational
 * components render. Backed by real Dexie (fake-indexeddb), same pattern
 * as complete-sale.test.ts.
 */

const BRANCH_ID = "branch-1";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    sku: "SKU-1",
    barcode: null,
    name: "Rice",
    categoryId: null,
    brandId: null,
    unitLabel: "bag",
    altUnitLabel: null,
    altUnitConversionFactor: null,
    altUnitSellPrice: null,
    costPrice: 800,
    sellPrice: 1000,
    expiryTracking: "off",
    expiryDate: null,
    lowStockThreshold: null,
    version: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function sale(overrides: Partial<Sale> = {}): Sale {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    branchId: BRANCH_ID,
    customerId: null,
    items: [
      {
        productId: "product-1",
        quantity: 2,
        unitPrice: 1000,
        discount: 0,
        unitLabel: "bag",
        conversionFactor: 1,
        movementClientId: crypto.randomUUID(),
      },
    ],
    payments: [{ method: "cash", amount: 2000 }],
    subtotal: 2000,
    discount: 0,
    total: 2000,
    createdAtLocal: now,
    createdAt: now,
    createdByUserId: "user-1",
    voidedAt: null,
    ...overrides,
  };
}

describe("useReportsData", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.products.clear();
    await db.expenses.clear();
    await db.purchases.clear();
    await db.stockMovements.clear();
  });

  it("defaults to the 'today' period and computes totals from seeded sales/expenses/purchases", async () => {
    await db.products.add(product());
    await db.sales.add(sale());
    const expense: Expense = {
      id: crypto.randomUUID(),
      branchId: BRANCH_ID,
      category: "Rent",
      amount: 500,
      note: null,
      createdAtLocal: new Date().toISOString(),
      createdByUserId: "user-1",
    };
    await db.expenses.add(expense);
    const purchase: Purchase = {
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId: BRANCH_ID,
      supplierId: "supplier-1",
      items: [{ productId: "product-1", quantity: 5, unitCost: 800, movementClientId: crypto.randomUUID() }],
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "user-1",
    };
    await db.purchases.add(purchase);

    const { result } = renderHook(() => useReportsData());

    expect(result.current.period).toBe("today");

    await waitFor(() => expect(result.current.result).toBeDefined());

    expect(result.current.periodSales).toHaveLength(1);
    expect(result.current.periodExpensesTotal).toBe(500);
    expect(result.current.periodPurchasesTotal).toBe(5 * 800);
  });

  it("excludes voided sales from periodSales", async () => {
    await db.products.add(product());
    await db.sales.add(sale({ voidedAt: new Date().toISOString() }));

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.result).toBeDefined());

    expect(result.current.periodSales).toHaveLength(0);
  });

  it("excludes sales from before the selected period start", async () => {
    await db.products.add(product());
    await db.sales.add(sale({ createdAtLocal: new Date("2000-01-01").toISOString() }));

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.result).toBeDefined());

    expect(result.current.periodSales).toHaveLength(0);
  });

  it("setPeriod switches the window and re-derives results", async () => {
    await db.products.add(product());
    await db.sales.add(sale({ createdAtLocal: new Date("2000-01-01").toISOString() }));

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.result).toBeDefined());
    expect(result.current.periodSales).toHaveLength(0);

    act(() => {
      result.current.setPeriod("month");
    });
    expect(result.current.period).toBe("month");
    // Old sale is from year 2000, still outside even the "month" window.
    await waitFor(() => expect(result.current.periodSales).toHaveLength(0));
  });

  it("computes bestSellers ranked by quantity sold, aggregating across sales", async () => {
    await db.products.add(product({ id: "product-1", name: "Rice" }));
    await db.products.add(product({ id: "product-2", name: "Beans", sku: "SKU-2" }));
    await db.sales.add(
      sale({
        items: [
          {
            productId: "product-1",
            quantity: 2,
            unitPrice: 1000,
            discount: 0,
            unitLabel: "bag",
            conversionFactor: 1,
            movementClientId: crypto.randomUUID(),
          },
        ],
      })
    );
    await db.sales.add(
      sale({
        items: [
          {
            productId: "product-2",
            quantity: 5,
            unitPrice: 700,
            discount: 0,
            unitLabel: "bag",
            conversionFactor: 1,
            movementClientId: crypto.randomUUID(),
          },
        ],
      })
    );

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.result).toBeDefined());

    expect(result.current.bestSellers[0].product?.id).toBe("product-2");
    expect(result.current.bestSellers[0].quantity).toBe(5);
    expect(result.current.bestSellers[1].product?.id).toBe("product-1");
    expect(result.current.bestSellers[1].quantity).toBe(2);
  });

  it("flags a product as low stock once its computed stock drops below LOW_STOCK_THRESHOLD", async () => {
    await db.products.add(product({ id: "product-1" }));
    const movement: StockMovement = {
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId: BRANCH_ID,
      productId: "product-1",
      quantityDelta: LOW_STOCK_THRESHOLD - 1,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "user-1",
    };
    await db.stockMovements.add(movement);

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.result).toBeDefined());

    expect(result.current.lowStockProducts.map((p: Product) => p.id)).toContain("product-1");
  });

  it("does not flag a product as low stock once its computed stock meets LOW_STOCK_THRESHOLD", async () => {
    await db.products.add(product({ id: "product-1" }));
    const movement: StockMovement = {
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId: BRANCH_ID,
      productId: "product-1",
      quantityDelta: LOW_STOCK_THRESHOLD,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdByUserId: "user-1",
    };
    await db.stockMovements.add(movement);

    const { result } = renderHook(() => useReportsData());
    await waitFor(() => expect(result.current.result).toBeDefined());

    expect(result.current.lowStockProducts.map((p: Product) => p.id)).not.toContain("product-1");
  });
});
