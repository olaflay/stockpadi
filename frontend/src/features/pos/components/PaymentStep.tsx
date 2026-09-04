import { useState } from "react";
import { UserPlus } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";
import { NairaIcon } from "@/components/ui/NairaIcon";
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

/** Quick bank-provider chips for transfer audit metadata (§9.3). */
const TRANSFER_PROVIDERS = ["OPay", "Moniepoint", "PalmPay", "Kuda", "Commercial Bank"];

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
  onUpdatePaymentTendered: (index: number, tendered: number) => void;
  onUpdatePaymentNote: (index: number, note: string) => void;
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
    onUpdatePaymentTendered,
    onUpdatePaymentNote,
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
  // Seeded from the payment line so returning to Payment after a cart trip
  // keeps the tendered/note the cashier already entered (§9.1, §9.3).
  const [cashTendered, setCashTendered] = useState(() =>
    effectivePayments[0]?.tenderedAmount ? String(effectivePayments[0].tenderedAmount) : ""
  );
  const [transferMeta, setTransferMeta] = useState<Record<number, { provider?: string; sender?: string }>>(
    () => {
      const seed: Record<number, { provider?: string; sender?: string }> = {};
      effectivePayments.forEach((p, i) => {
        if (p.note) {
          const [provider, ...rest] = p.note.split(" · ");
          seed[i] = { provider: provider || undefined, sender: rest.join(" · ") || undefined };
        }
      });
      return seed;
    }
  );

  /** First payment is cash and it's the only line (no split). */
  const isCashOnly = effectivePayments.length === 1 && effectivePayments[0].method === "cash";
  const tenderedAmount = parseFloat(cashTendered) || 0;
  const changeDue = tenderedAmount - total;
  const insufficientCash = isCashOnly && tenderedAmount > 0 && tenderedAmount < total - AMOUNT_EPSILON;

  /** Quick-tender cash chips (§9.1 / §10.7): exact, nearest ₦1,000, and the
      highest hand-tendered note bundles above the total. */
  const quickTenderChips = (() => {
    const roundUpThousand = Math.ceil(total / 1000) * 1000;
    return [
      { label: `Exact ${formatCurrency(total)}`, value: total },
      ...(roundUpThousand > total ? [{ label: formatCurrency(roundUpThousand), value: roundUpThousand }] : []),
      ...[5000, 10000]
        .filter((d) => d > total)
        .map((d) => ({ label: formatCurrency(d), value: d })),
    ];
  })();

  function applyTendered(value: number) {
    setCashTendered(String(value));
    onUpdatePaymentTendered(0, value);
  }

  function handleTenderedTyped(raw: string) {
    setCashTendered(raw);
    const numeric = parseFloat(raw);
    onUpdatePaymentTendered(0, Number.isFinite(numeric) && numeric > 0 ? numeric : 0);
  }

  function commitTransferNote(index: number, meta: { provider?: string; sender?: string }) {
    const parts = [meta.provider, meta.sender].filter(Boolean);
    onUpdatePaymentNote(index, parts.join(" · "));
  }

  function toggleTransferProvider(index: number, provider: string) {
    const current = transferMeta[index] ?? {};
    const meta = { ...current, provider: current.provider === provider ? "" : provider };
    setTransferMeta((prev) => ({ ...prev, [index]: meta }));
    commitTransferNote(index, meta);
  }

  function setTransferSender(index: number, sender: string) {
    const meta = { ...(transferMeta[index] ?? {}), sender };
    setTransferMeta((prev) => ({ ...prev, [index]: meta }));
    commitTransferNote(index, meta);
  }

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
          <span className="flex items-center gap-1 font-number text-[length:var(--font-size-title)] font-semibold tabular-nums text-on-surface">
            <NairaIcon size={16} />
            {formatCurrency(total).replace(/[₦\s]/g, "")}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">Payment method</span>
          {effectivePayments.map((payment, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
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
              {/* Bank transfer audit metadata: provider chips + sender/session ID,
                  composed into the payment's note and printed on the receipt (§9.3) */}
              {payment.method === "transfer" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {TRANSFER_PROVIDERS.map((provider) => {
                      const active = transferMeta[index]?.provider === provider;
                      return (
                        <button
                          key={provider}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleTransferProvider(index, provider)}
                          className={`min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border px-3 text-[length:var(--font-size-caption)] font-medium transition-colors ${
                            active
                              ? "border-brand-accent bg-brand-accent text-brand-accent-contrast"
                              : "border-border bg-surface-container text-on-surface"
                          }`}
                        >
                          {provider}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    aria-label={`Sender name / session ID for payment ${index + 1}`}
                    placeholder="Sender name / session ID"
                    value={transferMeta[index]?.sender ?? ""}
                    onChange={(e) => setTransferSender(index, e.target.value)}
                    className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-caption)] text-on-surface-muted"
                  />
                </div>
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

        {/* Cash tendered & change due — only when the sole payment is cash. Quick
            tender chips for one-tap denominations; the CHANGE TO RETURN block
            is a prominent success container so the cashier never misses it (§9.1) */}
        {isCashOnly && (
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
            <label className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Cash tendered
            </label>

            <div className="flex flex-wrap gap-1.5">
              {quickTenderChips.map((chip) => {
                const active = tenderedAmount === chip.value;
                return (
                  <button
                    key={chip.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => applyTendered(chip.value)}
                    className={`min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border px-3 font-number text-[length:var(--font-size-caption)] font-medium tabular-nums transition-colors ${
                      active
                        ? "border-brand-accent bg-brand-accent text-brand-accent-contrast"
                        : "border-border bg-surface-container-high text-on-surface"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
              {tenderedAmount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => applyTendered(tenderedAmount + 500)}
                    className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface-container text-[length:var(--font-size-caption)] font-medium text-on-surface transition-colors px-3 font-number tabular-nums"
                  >
                    +₦500
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTendered(tenderedAmount + 1000)}
                    className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface-container text-[length:var(--font-size-caption)] font-medium text-on-surface transition-colors px-3 font-number tabular-nums"
                  >
                    +₦1,000
                  </button>
                </>
              )}
            </div>

            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="How much did the customer give you?"
              value={cashTendered}
              onChange={(e) => handleTenderedTyped(e.target.value)}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface tabular-nums"
            />
            {tenderedAmount > 0 && (
              <div className="flex items-center justify-between">
                {insufficientCash ? (
                  <span className="text-[length:var(--font-size-body)] font-medium text-danger">
                    Not enough — need {formatCurrency(total - tenderedAmount)} more
                  </span>
                ) : changeDue > 0 ? (
                  <div className="flex w-full flex-col items-center gap-0.5 rounded-[var(--radius-control)] bg-success-container px-3 py-3">
                    <span className="text-[length:var(--font-size-caption)] font-medium uppercase tracking-wide text-on-success-container">
                      Change to return
                    </span>
                    <span className="font-number text-[length:var(--font-size-title-lg)] font-bold tabular-nums text-on-success-container">
                      {formatCurrency(changeDue)}
                    </span>
                  </div>
                ) : (
                  <span className="text-[length:var(--font-size-body)] font-medium text-on-surface-muted">
                    Exact amount
                  </span>
                )}
              </div>
            )}
          </div>
        )}

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
                  aria-label="Change credit customer"
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
                    aria-label="Add new customer for credit"
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
          disabled={isSubmitting || Math.abs(remaining) > AMOUNT_EPSILON || (hasCreditLine && !creditCustomerId) || insufficientCash}
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
