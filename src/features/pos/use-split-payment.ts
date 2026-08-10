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
    next[index] = { ...next[index], amount: Number.isFinite(amount) ? amount : 0 };
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
    addPaymentLine,
    removePaymentLine,
    reset,
  };
}
