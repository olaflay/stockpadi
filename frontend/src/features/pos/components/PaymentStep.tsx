import { useState } from "react";
import { UserPlus } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { addCreditCustomer } from "@/features/pos/add-credit-customer";
import { AMOUNT_EPSILON } from "@/features/pos/use-split-payment";
import { PAYMENT_METHODS, type PaymentMethod, type SalePayment } from "@/types/sale";
import type { LocalCustomer } from "@/lib/db";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank Transfer",
  pos_terminal: "POS",
  credit: "Credit (Owing)",
};

export function PaymentStep(props: {
  itemCount: number;
  total: number;
  effectivePayments: SalePayment[];
  remaining: number;
  hasCreditLine: boolean;
  creditAmount: number;
  customers: LocalCustomer[] | undefined;
  creditCustomerId: string | null;
  onSelectCreditCustomer: (id: string | null) => void;
  onUpdatePaymentMethod: (index: number, method: PaymentMethod) => void;
  onUpdatePaymentAmount: (index: number, amount: number) => void;
  onAddPaymentLine: () => void;
  onRemovePaymentLine: (index: number) => void;
  isSubmitting: boolean;
  isOnline: boolean;
  onBack: () => void;
  onCompleteSale: () => void;
}) {
  const {
    itemCount,
    total,
    effectivePayments,
    remaining,
    hasCreditLine,
    creditAmount,
    customers,
    creditCustomerId,
    onSelectCreditCustomer,
    onUpdatePaymentMethod,
    onUpdatePaymentAmount,
    onAddPaymentLine,
    onRemovePaymentLine,
    isSubmitting,
    isOnline,
    onBack,
    onCompleteSale,
  } = props;

  const { showToast } = useToast();
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  async function handleAddCreditCustomer() {
    const name = newCustomerName.trim();
    if (!name) return;
    const customer = await addCreditCustomer(name, newCustomerPhone);
    onSelectCreditCustomer(customer.id);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setShowNewCustomerForm(false);
    showToast(`${name} added`, "success");
  }

  return (
    <div key="payment" className="flex h-full flex-col gap-4 animate-step-in">
      <ScreenHeader title="Payment" onBack={onBack} />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3">
          <span className="text-[length:var(--font-size-body)] text-on-surface-muted">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          <span className="font-mono text-[length:var(--font-size-title)] font-semibold tabular-nums text-on-surface">{formatCurrency(total)}</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">Payment method</span>
          {effectivePayments.map((payment, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <select
                aria-label={`Payment method ${index + 1}`}
                value={payment.method}
                onChange={(event) => onUpdatePaymentMethod(index, event.target.value as PaymentMethod)}
                className="min-h-[var(--touch-target-min)] flex-1 min-w-[120px] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYMENT_LABELS[method]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                aria-label={`Payment amount ${index + 1}`}
                min="0"
                step="0.01"
                value={payment.amount}
                onChange={(event) => onUpdatePaymentAmount(index, event.target.valueAsNumber)}
                className="min-h-[var(--touch-target-min)] flex-1 min-w-[80px] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
              />
              {effectivePayments.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemovePaymentLine(index)}
                  aria-label="Remove this payment method"
                  className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-3">
            {effectivePayments.length < PAYMENT_METHODS.length && (
              <button
                type="button"
                onClick={onAddPaymentLine}
                className="min-h-[var(--touch-target-min)] text-[length:var(--font-size-caption)] font-medium text-brand-accent"
              >
                + Split across another method
              </button>
            )}
            {Math.abs(remaining) > AMOUNT_EPSILON && (
              <span
                className={`text-[length:var(--font-size-caption)] font-medium ${
                  remaining > 0 ? "text-warning" : "text-danger"
                }`}
              >
                {remaining > 0 ? `Remaining ${formatCurrency(remaining)}` : `Over by ${formatCurrency(-remaining)}`}
              </span>
            )}
          </div>
        </div>

        {hasCreditLine && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Who&apos;s buying {formatCurrency(creditAmount)} on credit? *
            </span>

            {creditCustomerId ? (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-container-high px-3 py-2">
                <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
                  {customers?.find((c) => c.id === creditCustomerId)?.name}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectCreditCustomer(null)}
                  className="min-h-[var(--touch-target-min)] px-2 text-[length:var(--font-size-caption)] font-medium text-brand-accent"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  aria-label="Search customer by name or phone"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search customer by name or phone"
                  className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
                />

                {customerSearch.trim() && (
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {(customers ?? [])
                      .filter((c) => `${c.name} ${c.phone ?? ""}`.toLowerCase().includes(customerSearch.toLowerCase()))
                      .slice(0, 5)
                      .map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectCreditCustomer(c.id);
                              setCustomerSearch("");
                            }}
                            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between rounded-[var(--radius-control)] px-3 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container-high transition-colors"
                          >
                            <span>{c.name}</span>
                            {c.phone && (
                              <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                                {c.phone}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                  </ul>
                )}

                {showNewCustomerForm ? (
                  <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container p-2">
                    <input
                      aria-label="Customer name"
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                      placeholder="Customer name"
                      className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
                    />
                    <input
                      aria-label="Phone (optional)"
                      value={newCustomerPhone}
                      onChange={(event) => setNewCustomerPhone(event.target.value)}
                      placeholder="Phone (optional)"
                      className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
                    />
                    <RippleButton
                      type="button"
                      onClick={handleAddCreditCustomer}
                      disabled={!newCustomerName.trim()}
                      className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50"
                    >
                      Add customer
                    </RippleButton>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(true)}
                    className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-border text-[length:var(--font-size-body)] font-medium text-brand-accent"
                  >
                    <UserPlus size={18} aria-hidden />
                    New customer
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-2 border-t border-border bg-surface px-5 pt-3 pb-4">
        <RippleButton
          id="tour-pos-checkout"
          type="button"
          onClick={onCompleteSale}
          disabled={isSubmitting || Math.abs(remaining) > AMOUNT_EPSILON || (hasCreditLine && !creditCustomerId)}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Completing sale…" : "Complete sale"}
        </RippleButton>

        {!isOnline && (
          <p className="text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
            You&apos;re offline, this sale will sync once you&apos;re back online.
          </p>
        )}
      </div>
    </div>
  );
}
