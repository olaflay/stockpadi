import { useState } from "react";
import { PAYMENT_METHODS, type PaymentMethod, type SalePayment } from "@/types/sale";

/** A tiny tolerance for float addition (naira amounts), not a real currency epsilon. */
export const AMOUNT_EPSILON = 0.01;

/**
 * A sale can be split across payment methods (finding 1.1-A in
 * docs/RESEARCH-AND-PLAN.md). Empty `payments` means "not yet touched" — a
 * plain single-method sale (the common case) renders as one Cash row
 * defaulting to the full total with zero extra taps; splitting only
 * materializes once the cashier actually edits or adds a row.
 */
export function useSplitPayment(total: number) {
  const [payments, setPayments] = useState<SalePayment[]>([]);
  const [creditCustomerId, setCreditCustomerId] = useState<string | null>(null);

  const effectivePayments: SalePayment[] = payments.length > 0 ? payments : [{ method: "cash", amount: total }];
  const allocated = effectivePayments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = total - allocated;
  const hasCreditLine = effectivePayments.some((p) => p.method === "credit");
  const creditAmount = effectivePayments
    .filter((p) => p.method === "credit")
    .reduce((sum, p) => sum + p.amount, 0);

  function updatePaymentMethod(index: number, method: PaymentMethod) {
    const next = [...effectivePayments];
    next[index] = { ...next[index], method };
    setPayments(next);
    if (!next.some((p) => p.method === "credit")) {
      setCreditCustomerId(null);
    }
  }

  function updatePaymentAmount(index: number, amount: number) {
    const next = [...effectivePayments];
    // Non-finite → 0, and never let a negative slip through (a negative or
    // zero-then-over-total payment line would pass the local balance check
    // but be rejected server-side, stranding the sale in the outbox forever).
    const clamped = Number.isFinite(amount) && amount > 0 ? amount : 0;
    next[index] = { ...next[index], amount: clamped };
    setPayments(next);
  }

  /**
   * Cash-tender register metadata (§9.1): how much the customer actually
   * handed over. `amount` stays the sale-total portion; `tenderedAmount`
   * only feeds the receipt's Tendered/Change line and the register drawer.
   */
  function updatePaymentTendered(index: number, tendered: number) {
    const next = [...effectivePayments];
    const clamped = Number.isFinite(tendered) && tendered >= 0 ? tendered : 0;
    next[index] = { ...next[index], tenderedAmount: clamped > 0 ? clamped : undefined };
    setPayments(next);
  }

  /**
   * Bank transfer audit metadata (§9.3): provider + sender/session reference.
   * Stored on the payment line so completeSale persists it to the sale record
   * and receipts can print it for end-of-day cross-check.
   */
  function updatePaymentNote(index: number, note: string) {
    const next = [...effectivePayments];
    const trimmed = note.trim();
    next[index] = { ...next[index], note: trimmed ? trimmed : undefined };
    setPayments(next);
  }

  function addPaymentLine() {
    const remainingNow = Math.max(total - allocated, 0);
    const unusedMethod = PAYMENT_METHODS.find((m) => !effectivePayments.some((p) => p.method === m)) ?? "transfer";
    setPayments([...effectivePayments, { method: unusedMethod, amount: remainingNow }]);
  }

  function removePaymentLine(index: number) {
    const next = effectivePayments.filter((_, i) => i !== index);
    setPayments(next.length > 0 ? next : []);
    if (!next.some((p) => p.method === "credit")) {
      setCreditCustomerId(null);
    }
  }

  function reset() {
    setPayments([]);
    setCreditCustomerId(null);
  }

  return {
    effectivePayments,
    remaining,
    hasCreditLine,
    creditAmount,
    creditCustomerId,
    setCreditCustomerId,
    updatePaymentMethod,
    updatePaymentAmount,
    updatePaymentTendered,
    updatePaymentNote,
    addPaymentLine,
    removePaymentLine,
    reset,
  };
}
