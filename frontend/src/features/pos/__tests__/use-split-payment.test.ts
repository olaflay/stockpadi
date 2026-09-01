// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { AMOUNT_EPSILON, useSplitPayment } from "@/features/pos/use-split-payment";

/**
 * Split-payment state extracted from pos/page.tsx. `effectivePayments`
 * defaults to a single full-total cash row until the cashier actually
 * touches it, per finding 1.1-A in docs/RESEARCH-AND-PLAN.md.
 */

describe("useSplitPayment", () => {
  it("defaults to a single cash line for the full total when untouched", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    expect(result.current.effectivePayments).toEqual([{ method: "cash", amount: 1000 }]);
    expect(result.current.remaining).toBe(0);
    expect(result.current.hasCreditLine).toBe(false);
    expect(result.current.creditAmount).toBe(0);
  });

  it("updatePaymentMethod materializes the default row and changes its method", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentMethod(0, "transfer");
    });
    expect(result.current.effectivePayments).toEqual([{ method: "transfer", amount: 1000 }]);
  });

  it("updatePaymentAmount changes the amount and rejects non-finite input as 0", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentAmount(0, 400);
    });
    expect(result.current.effectivePayments[0].amount).toBe(400);
    expect(result.current.remaining).toBe(600);

    act(() => {
      result.current.updatePaymentAmount(0, Number.NaN);
    });
    expect(result.current.effectivePayments[0].amount).toBe(0);
  });

  it("addPaymentLine adds a row for an unused method defaulting to the remaining balance", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentAmount(0, 400); // cash row now 400, remaining 600
    });
    act(() => {
      result.current.addPaymentLine();
    });
    expect(result.current.effectivePayments).toHaveLength(2);
    expect(result.current.effectivePayments[1].amount).toBe(600);
    expect(result.current.effectivePayments[1].method).not.toBe("cash");
  });

  it("addPaymentLine never picks a method already in use, falling back to transfer once exhausted", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentAmount(0, 250);
    });
    act(() => {
      result.current.addPaymentLine(); // 2nd line
    });
    act(() => {
      result.current.addPaymentLine(); // 3rd line
    });
    act(() => {
      result.current.addPaymentLine(); // 4th line: now all 4 PAYMENT_METHODS are in use
    });
    const methods = result.current.effectivePayments.map((p) => p.method);
    expect(new Set(methods).size).toBe(4); // all four distinct methods used

    act(() => {
      result.current.addPaymentLine(); // 5th line: PAYMENT_METHODS exhausted, falls back to "transfer"
    });
    expect(result.current.effectivePayments[4].method).toBe("transfer");
  });

  it("removePaymentLine removes a row and collapses to [] when the last row is removed", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentAmount(0, 400);
      result.current.addPaymentLine();
    });
    expect(result.current.effectivePayments).toHaveLength(2);

    act(() => {
      result.current.removePaymentLine(1);
    });
    expect(result.current.effectivePayments).toHaveLength(1);

    act(() => {
      result.current.removePaymentLine(0);
    });
    // Collapsing back to [] re-materializes the single-cash-row default.
    expect(result.current.effectivePayments).toEqual([{ method: "cash", amount: 1000 }]);
  });

  it("detects a credit line and sums the credit-tagged amount only", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentMethod(0, "credit");
    });
    act(() => {
      result.current.updatePaymentAmount(0, 300);
    });
    act(() => {
      result.current.addPaymentLine();
    });
    expect(result.current.hasCreditLine).toBe(true);
    expect(result.current.creditAmount).toBe(300);
  });

  it("clears creditCustomerId once no payment line uses credit anymore", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentMethod(0, "credit");
      result.current.setCreditCustomerId("customer-1");
    });
    expect(result.current.creditCustomerId).toBe("customer-1");

    act(() => {
      result.current.updatePaymentMethod(0, "cash");
    });
    expect(result.current.creditCustomerId).toBeNull();
  });

  it("removePaymentLine also clears creditCustomerId once the credit row is gone", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentMethod(0, "credit");
    });
    act(() => {
      result.current.setCreditCustomerId("customer-1");
    });
    act(() => {
      result.current.addPaymentLine();
    });
    expect(result.current.hasCreditLine).toBe(true);
    expect(result.current.creditCustomerId).toBe("customer-1");

    act(() => {
      result.current.removePaymentLine(0); // removes the credit row
    });
    expect(result.current.hasCreditLine).toBe(false);
    expect(result.current.creditCustomerId).toBeNull();
  });

  it("reset clears payments back to the default and clears creditCustomerId", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentMethod(0, "credit");
      result.current.setCreditCustomerId("customer-1");
      result.current.addPaymentLine();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.effectivePayments).toEqual([{ method: "cash", amount: 1000 }]);
    expect(result.current.creditCustomerId).toBeNull();
  });

  it("updatePaymentAmount clamps negative input to 0 (validation gate for the POS form)", () => {
    const { result } = renderHook(() => useSplitPayment(1000));
    act(() => {
      result.current.updatePaymentAmount(0, -50);
    });
    expect(result.current.effectivePayments[0].amount).toBe(0);
  });

  it("AMOUNT_EPSILON is a small tolerance suitable for float comparisons", () => {
    expect(AMOUNT_EPSILON).toBeGreaterThan(0);
    expect(AMOUNT_EPSILON).toBeLessThan(1);
  });
});
