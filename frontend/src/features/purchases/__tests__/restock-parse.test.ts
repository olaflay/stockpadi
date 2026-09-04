import { describe, expect, it } from "vitest";
import {
  RESTOCK_MAX_QUANTITY,
  parseRestockQuantity,
  parseUnitCost,
} from "@/features/purchases/restock-parse";

describe("parseRestockQuantity", () => {
  it("parses a plain integer", () => {
    expect(parseRestockQuantity("24", 1)).toBe(24);
  });

  it("strips non-digit characters defensively", () => {
    expect(parseRestockQuantity("12.5", 1)).toBe(125);
  });

  it("returns the fallback when empty", () => {
    expect(parseRestockQuantity("", 7)).toBe(7);
  });

  it("returns the fallback for 0 instead of snapping to an unedited value", () => {
    expect(parseRestockQuantity("0", 7)).toBe(7);
  });

  it("falls back for junk input", () => {
    expect(parseRestockQuantity("abc", 7)).toBe(7);
  });

  it("caps at the max quantity", () => {
    expect(parseRestockQuantity(String(RESTOCK_MAX_QUANTITY + 1), 1)).toBe(RESTOCK_MAX_QUANTITY);
  });
});

describe("parseUnitCost", () => {
  it("parses decimals", () => {
    expect(parseUnitCost("2500.5", 0)).toBe(2500.5);
  });

  it("allows empty to keep the fallback", () => {
    expect(parseUnitCost("", 50)).toBe(50);
  });

  it("rejects negatives and keeps the fallback", () => {
    expect(parseUnitCost("-5", 50)).toBe(50);
  });

  it("rejects multiple dots and keeps the fallback", () => {
    expect(parseUnitCost("1.2.3", 0)).toBe(0);
  });

  it("treats 0 as a valid cost", () => {
    expect(parseUnitCost("0", 50)).toBe(0);
  });

  it("rounds to two decimals", () => {
    expect(parseUnitCost("99.999", 0)).toBe(100);
  });
});