import { describe, expect, it } from "vitest";
import { calculateMovingAverageCost } from "../costing";

describe("calculateMovingAverageCost (IAS 2)", () => {
  it("calculates weighted average correctly with positive existing stock", () => {
    // Current stock: 10 units at ₦100 = ₦1,000 asset value
    // Restock: 10 units at ₦150 = ₦1,500 asset value
    // Total: 20 units with ₦2,500 asset value -> ₦125.00 average cost
    const cost = calculateMovingAverageCost({
      currentStock: 10,
      currentCostPrice: 100,
      restockQuantity: 10,
      restockUnitCost: 150,
    });
    expect(cost).toBe(125.0);
  });

  it("handles minor currency rounding (kobo quantization)", () => {
    // 10 units at ₦100 (₦1000) + 7 units at ₦133.33 (₦933.31) = ₦1,933.31 / 17 = ₦113.7241... -> ₦113.72
    const cost = calculateMovingAverageCost({
      currentStock: 10,
      currentCostPrice: 100,
      restockQuantity: 7,
      restockUnitCost: 133.33,
    });
    expect(cost).toBe(113.72);
  });

  it("sets baseline cost when existing stock is 0", () => {
    const cost = calculateMovingAverageCost({
      currentStock: 0,
      currentCostPrice: 100, // Stale cost
      restockQuantity: 50,
      restockUnitCost: 250,
    });
    expect(cost).toBe(250.0);
  });

  it("sets baseline cost when existing stock is negative (offline sales prior to restock)", () => {
    // If cashier sold 5 units offline before delivery arrived, current stock is -5.
    // Incoming delivery of 20 units at ₦300 sets new cost basis to ₦300.
    const cost = calculateMovingAverageCost({
      currentStock: -5,
      currentCostPrice: 150,
      restockQuantity: 20,
      restockUnitCost: 300,
    });
    expect(cost).toBe(300.0);
  });

  it("returns current cost if restock quantity is 0", () => {
    const cost = calculateMovingAverageCost({
      currentStock: 10,
      currentCostPrice: 120.5,
      restockQuantity: 0,
      restockUnitCost: 200,
    });
    expect(cost).toBe(120.5);
  });

  it("rejects negative restock unit cost", () => {
    expect(() =>
      calculateMovingAverageCost({
        currentStock: 10,
        currentCostPrice: 100,
        restockQuantity: 5,
        restockUnitCost: -10,
      })
    ).toThrow(/non-negative/i);
  });
});

