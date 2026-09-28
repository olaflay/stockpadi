import { describe, it, expect } from "vitest";
import {
  resolveStockStatus,
  isLowStock,
  isOutOfStock,
  stockStatusLabel,
} from "../product-insights";

describe("resolveStockStatus and helpers", () => {
  it("treats undefined or NaN as untracked, never collapsing to 0 or out-of-stock", () => {
    expect(resolveStockStatus(undefined)).toBe("untracked");
    expect(resolveStockStatus(NaN)).toBe("untracked");
    expect(isOutOfStock(undefined)).toBe(false);
    expect(isLowStock(undefined)).toBe(false);
    expect(stockStatusLabel("untracked")).toBe("No stock tracked");
  });

  it("identifies out-of-stock when quantity <= 0", () => {
    expect(resolveStockStatus(0)).toBe("out");
    expect(resolveStockStatus(-1)).toBe("out");
    expect(isOutOfStock(0)).toBe(true);
    expect(isLowStock(0)).toBe(false);
    expect(stockStatusLabel("out")).toBe("Out of stock");
  });

  it("identifies low stock when quantity <= threshold", () => {
    // Default threshold is 5
    expect(resolveStockStatus(5)).toBe("low");
    expect(resolveStockStatus(1)).toBe("low");
    expect(isLowStock(5)).toBe(true);
    expect(isLowStock(1)).toBe(true);
    expect(isOutOfStock(5)).toBe(false);
    expect(stockStatusLabel("low", 5)).toBe("Only 5 left");

    // Custom threshold
    expect(resolveStockStatus(10, 10)).toBe("low");
    expect(isLowStock(10, 10)).toBe(true);
    expect(resolveStockStatus(11, 10)).toBe("ok");
    expect(isLowStock(11, 10)).toBe(false);
  });

  it("identifies ok stock when quantity > threshold", () => {
    expect(resolveStockStatus(6)).toBe("ok");
    expect(resolveStockStatus(100)).toBe("ok");
    expect(isLowStock(6)).toBe(false);
    expect(isOutOfStock(6)).toBe(false);
    expect(stockStatusLabel("ok", 6)).toBe("6 in stock");
  });
});
