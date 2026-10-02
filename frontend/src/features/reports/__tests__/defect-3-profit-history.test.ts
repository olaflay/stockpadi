import { describe, expect, it } from "vitest";
import { computeCogs, computeGrossProfit } from "@/features/reports/compute-profit";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";

/**
 * DEFECT 3 — a sale's recorded profit is not a historical fact.
 *
 * sale_items stores no cost snapshot, so computeGrossProfit and computeCogs
 * both read the product's CURRENT cost_price. Editing a product's cost therefore
 * retroactively rewrites the profit of every sale that product ever appeared in,
 * silently and permanently: yesterday's signed report changes today with no
 * record that it changed.
 *
 * Nothing in the product or sale lifecycle keeps cost stable. Receiving a
 * purchase does not write a new cost, and editing a product writes whatever the
 * operator typed. So the number a shop reports as "profit last month" is only
 * reproducible for as long as nobody touches a cost price.
 *
 * The fix is a cost snapshot on sale_items, which requires product decisions
 * this test deliberately does not make. It is documented as an open question
 * rather than fixed here.
 */

function product(costPrice: number): Product {
  return {
    id: "p1",
    businessId: "b1",
    sku: "SKU-1",
    name: "Widget",
    costPrice,
    sellPrice: 150,
    stockAlertAt: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Product;
}

function sale(): Sale {
  return {
    id: "s1",
    clientId: "c1",
    branchId: "br1",
    customerId: null,
    items: [
      {
        productId: "p1",
        quantity: 10,
        unitPrice: 150,
        discount: 0,
        unitLabel: "piece",
        conversionFactor: 1,
        movementClientId: "m1",
      },
    ],
    payments: [{ method: "cash", amount: 1500 }],
    subtotal: 1500,
    discount: 0,
    total: 1500,
    createdAtLocal: "2026-03-01T10:00:00.000Z",
    createdAt: "2026-03-01T10:00:00.000Z",
    voidedAt: null,
  } as unknown as Sale;
}

describe("DEFECT 3: editing a cost price rewrites the profit of past sales", () => {
  it("reports different gross profit for the same immutable sale", () => {
    const theSameSale = sale();

    const asSoldInMarch = computeGrossProfit([theSameSale], [product(100)]);
    const afterACostCorrection = computeGrossProfit([theSameSale], [product(140)]);

    // Truth at the time of sale was 10 x (150 - 100) = 500.
    expect(asSoldInMarch).toBe(500);
    // After a later restatement of cost, the identical sale reports 100.
    expect(afterACostCorrection).toBe(100);
    expect(afterACostCorrection).not.toBe(asSoldInMarch);
  });

  it("reports different COGS for the same immutable sale", () => {
    const theSameSale = sale();

    expect(computeCogs([theSameSale], [product(100)])).toBe(1000);
    expect(computeCogs([theSameSale], [product(140)])).toBe(1400);
  });

  it("makes profit move the wrong way when a cost is corrected upward", () => {
    const theSameSale = sale();

    // Restating cost upward must never increase reported profit.
    expect(computeGrossProfit([theSameSale], [product(140)])).toBeLessThan(
      computeGrossProfit([theSameSale], [product(100)])
    );
  });

  it("reports zero cost for a product that has since been deleted", () => {
    // A deleted product is not in the products array, so cost silently becomes
    // 0 and the sale's profit silently becomes its full revenue.
    const theSameSale = sale();

    expect(computeGrossProfit([theSameSale], [])).toBe(1500);
  });
});

describe("BLOCKER B3 (CLOSED): immutable cost snapshot freezes profit and COGS against all mutations", () => {
  function saleWithSnapshot(cost: number): Sale {
    const s = sale();
    s.items[0].unitCost = cost;
    s.items[0].costBasis = "snapshot";
    s.items[0].productVersion = 1;
    s.items[0].costFlags = [];
    return s;
  }

  it("gross profit remains identical after product cost price changes", () => {
    const snapshottedSale = saleWithSnapshot(100);

    const asSoldInMarch = computeGrossProfit([snapshottedSale], [product(100)]);
    const afterACostCorrection = computeGrossProfit([snapshottedSale], [product(140)]);

    // Both must be exactly 500: 10 x (150 - 100) = 500
    expect(asSoldInMarch).toBe(500);
    expect(afterACostCorrection).toBe(500);
    expect(afterACostCorrection).toBe(asSoldInMarch);
  });

  it("COGS remains identical after product cost price changes", () => {
    const snapshottedSale = saleWithSnapshot(100);

    expect(computeCogs([snapshottedSale], [product(100)])).toBe(1000);
    expect(computeCogs([snapshottedSale], [product(140)])).toBe(1000);
  });

  it("gross profit and COGS are immune to product deletion", () => {
    const snapshottedSale = saleWithSnapshot(100);

    // When the product is deleted (products array empty), the immutable snapshot still protects profit
    expect(computeGrossProfit([snapshottedSale], [])).toBe(500);
    expect(computeCogs([snapshottedSale], [])).toBe(1000);
  });
});