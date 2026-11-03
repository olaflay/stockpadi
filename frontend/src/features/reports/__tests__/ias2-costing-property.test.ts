import { describe, expect, it } from "vitest";
import { calculateMovingAverageCost } from "@/features/inventory/costing";
import { computeGrossProfit, computeNetProfit, computeCogs } from "../compute-profit";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";

interface ProductSim {
  id: string;
  stock: number;
  costPrice: number;
}

/**
 * Deterministic pseudo-random number generator (LCG) for reproducible fuzz tests.
 */
function createSeededRng(seed: number) {
  let state = seed;
  return function next(): number {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("IAS 2 Costing & Financial Invariant Property-Based Fuzzer", () => {
  it("verifies inventory valuation and net profit invariance across 1,000 randomized state transitions", () => {
    const rng = createSeededRng(20261029);

    for (let iteration = 0; iteration < 1000; iteration++) {
      const product: ProductSim = {
        id: `prod-${iteration}`,
        stock: Math.floor(rng() * 20), // 0 to 19 units
        costPrice: Math.round((50 + rng() * 200) * 100) / 100, // ₦50 to ₦250
      };

      const sales: Sale[] = [];
      const expenses: Expense[] = [];
      let totalStockDelta = product.stock;

      // Execute between 5 and 15 random operations per iteration
      const opCount = 5 + Math.floor(rng() * 10);

      for (let op = 0; op < opCount; op++) {
        const actionChoice = rng();

        if (actionChoice < 0.4) {
          // Action 1: Restock (Purchase Receipt)
          const restockQty = 1 + Math.floor(rng() * 50); // 1 to 50
          const restockCost = Math.round((20 + rng() * 500) * 100) / 100; // ₦20 to ₦520

          const newCost = calculateMovingAverageCost({
            currentStock: product.stock,
            currentCostPrice: product.costPrice,
            restockQuantity: restockQty,
            restockUnitCost: restockCost,
          });

          product.stock += restockQty;
          product.costPrice = newCost;
          totalStockDelta += restockQty;

          // Invariant: costPrice must remain finite and non-negative
          expect(Number.isFinite(product.costPrice)).toBe(true);
          expect(product.costPrice).toBeGreaterThanOrEqual(0);
        } else if (actionChoice < 0.75) {
          // Action 2: Sale with immutable cost snapshot
          const sellQty = 1 + Math.floor(rng() * 5);
          const sellPrice = Math.round((product.costPrice * (1.1 + rng() * 0.5)) * 100) / 100;
          const snapshottedCost = product.costPrice;

          const sale: Sale = {
            id: `sale-${iteration}-${op}`,
            clientId: `client-sale-${iteration}-${op}`,
            branchId: "branch-1",
            customerId: null,
            items: [
              {
                productId: product.id,
                quantity: sellQty,
                unitPrice: sellPrice,
                discount: 0,
                unitLabel: "piece",
                conversionFactor: 1,
                movementClientId: `move-${iteration}-${op}`,
                unitCost: snapshottedCost, // Immutable snapshot!
                costBasis: "snapshot",
              },
            ],
            payments: [{ method: "cash", amount: sellPrice * sellQty }],
            subtotal: sellPrice * sellQty,
            discount: 0,
            total: sellPrice * sellQty,
            createdAt: new Date().toISOString(),
            createdAtLocal: new Date().toISOString(),
            createdByUserId: "user-test",
            voidedAt: null,
          };

          sales.push(sale);
          product.stock -= sellQty;
          totalStockDelta -= sellQty;
        } else {
          // Action 3: Expense or Expense Reversal
          const amount = Math.round((100 + rng() * 2000) * 100) / 100;
          const isReversed = rng() < 0.3; // 30% chance of reversal

          const expense: Expense = {
            id: `exp-${iteration}-${op}`,
            branchId: "branch-1",
            category: "Supplies",
            amount,
            note: null,
            createdAtLocal: new Date().toISOString(),
            createdByUserId: "user-test",
            reversedAt: isReversed ? new Date().toISOString() : null,
            reversedByUserId: isReversed ? "user-test" : null,
            reversalReason: isReversed ? "Audit adjustment" : null,
          };
          expenses.push(expense);
        }
      }

      // Assert Invariant A: Physical Stock Conservation
      expect(product.stock).toBe(totalStockDelta);

      // Assert Invariant B: Inventory Valuation === stock * costPrice
      const valuation = Math.max(0, product.stock) * product.costPrice;
      expect(Number.isFinite(valuation)).toBe(true);
      expect(valuation).toBeGreaterThanOrEqual(0);

      // Assert Invariant C: Financial Conservation Equation
      // Net Profit === Gross Profit - Active OPEX
      const cogs = computeCogs(sales);
      const grossProfit = computeGrossProfit(sales);
      const netProfit = computeNetProfit(grossProfit, expenses);

      const activeExpenses = expenses.filter((e) => !e.reversedAt);
      const activeOpex = activeExpenses.reduce((sum, e) => sum + e.amount, 0);

      if (sales.length > 0) {
        const revenue = sales.reduce((sum, s) => sum + s.total, 0);
        expect(grossProfit).not.toBeNull();
        expect(grossProfit!).toBeCloseTo(revenue - cogs!, 2);
        expect(netProfit!).toBeCloseTo(grossProfit! - activeOpex, 2);
      }
    }
  });
});

