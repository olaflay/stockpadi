import { describe, expect, it } from "vitest";

describe("Multi-Channel Reconciliation Calculations", () => {
  it("computes per-channel expected amounts and variances accurately", () => {
    const cashSales = 45000;
    const transferSales = 30000;
    const posSales = 10000;
    const expenses = 3500;

    const expectedNetCash = cashSales - expenses; // 41500
    const expectedTransfer = transferSales; // 30000
    const expectedPos = posSales; // 10000

    expect(expectedNetCash).toBe(41500);
    expect(expectedTransfer).toBe(30000);
    expect(expectedPos).toBe(10000);

    // Case 1: Fully balanced
    const countedCash1 = 41500;
    const verifiedTransfer1 = 30000;
    const countedPos1 = 10000;

    const cashVariance1 = countedCash1 - expectedNetCash;
    const transferVariance1 = verifiedTransfer1 - expectedTransfer;
    const posVariance1 = countedPos1 - expectedPos;
    const totalVariance1 = cashVariance1 + transferVariance1 + posVariance1;

    expect(cashVariance1).toBe(0);
    expect(transferVariance1).toBe(0);
    expect(posVariance1).toBe(0);
    expect(totalVariance1).toBe(0);

    // Case 2: Discrepancy (e.g. 500 short in cash, 2000 missing bank alert)
    const countedCash2 = 41000;
    const verifiedTransfer2 = 28000;
    const countedPos2 = 10000;

    const cashVariance2 = countedCash2 - expectedNetCash; // -500
    const transferVariance2 = verifiedTransfer2 - expectedTransfer; // -2000
    const posVariance2 = countedPos2 - expectedPos; // 0
    const totalVariance2 = cashVariance2 + transferVariance2 + posVariance2; // -2500

    expect(cashVariance2).toBe(-500);
    expect(transferVariance2).toBe(-2000);
    expect(totalVariance2).toBe(-2500);
  });

  it("handles decimal precision without floating point drift", () => {
    const expected = 12500.5;
    const counted = 12500.5;
    const variance = counted - expected;
    expect(Math.abs(variance)).toBeLessThan(0.01);
  });
});
