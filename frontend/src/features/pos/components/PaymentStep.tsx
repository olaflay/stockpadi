import { useState } from "react";
import { UserPlus, BookUser, AlertCircle } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { addCreditCustomer } from "@/features/pos/add-credit-customer";
import { AMOUNT_EPSILON } from "@/features/pos/use-split-payment";
import { PAYMENT_METHODS, type PaymentMethod, type SalePayment } from "@/types/sale";
import { db, type LocalCustomer } from "@/lib/db";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { isContactPickerSupported, openNativeContactPicker } from "@/lib/contact-picker";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank Transfer",
  pos_terminal: "POS",
  credit: "Credit (Owing)",
};

/** Quick bank-provider chips for transfer audit metadata (§9.3). */
const TRANSFER_PROVIDERS = ["OPay", "Moniepoint", "PalmPay", "Kuda", "Commercial Bank"];

/** Quick POS terminal account chips for daily multi-fintech settlement tagging. */
const POS_TERMINAL_PROVIDERS = ["Moniepoint POS", "OPay POS", "PalmPay POS", "Counter POS"];

export function PaymentStep(props: {
  itemCount: number;
  subtotal?: number;
  discount?: number;
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
  hideHeader?: boolean;
}) {
  const {
    itemCount,
    subtotal,
    discount,
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
    hideHeader = false,
  } = props;

  const { showToast } = useToast();
  const [customerSearch, setCustomerSearch] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [missingPhoneInput, setMissingPhoneInput] = useState("");
  const [isSavingCustomerPhone, setIsSavingCustomerPhone] = useState(false);

  // Seeded from the payment line so returning to Payment after a cart trip
  // keeps the tendered/note the cashier already entered (§9.1, §9.3).
  const [cashTendered, setCashTendered] = useState(() =>
    effectivePayments[0]?.tenderedAmount ? String(effectivePayments[0].tenderedAmount) : ""
  );
  const [transferMeta, setTransferMeta] = useState<Record<number, { provider?: string; sender?: string }>>(
    () => {
      const seed: Record<number, { provider?: string; sender?: string }> = {};
      effectivePayments.forEach((p, i) => {
        if (p.method === "transfer" && p.note) {
          const [provider, ...rest] = p.note.split(" · ");
          seed[i] = { provider: provider || undefined, sender: rest.join(" · ") || undefined };
        }
      });
      return seed;
    }
  );

  const [posMeta, setPosMeta] = useState<Record<number, { provider?: string; terminalLabel?: string }>>(
    () => {
      const seed: Record<number, { provider?: string; terminalLabel?: string }> = {};
      effectivePayments.forEach((p, i) => {
        if (p.method === "pos_terminal" && p.note) {
          const [provider, ...rest] = p.note.split(" · ");
          seed[i] = { provider: provider || undefined, terminalLabel: rest.join(" · ") || undefined };
        }
      });
      return seed;
    }
  );

  const selectedCreditCustomer = customers?.find((c) => c.id === creditCustomerId);
  const creditCustomerHasPhone = Boolean(selectedCreditCustomer?.phone?.trim());

  /** First payment is cash and it's the only line (no split). */
  const isCashOnly = effectivePayments.length === 1 && effectivePayments[0].method === "cash";
  const tenderedAmount = parseFloat(cashTendered) || 0;
  const changeDue = tenderedAmount - total;
  const insufficientCash = isCashOnly && tenderedAmount > 0 && tenderedAmount < total - AMOUNT_EPSILON;

  function commitPosNote(index: number, meta: { provider?: string; terminalLabel?: string }) {
    const parts = [meta.provider, meta.terminalLabel].filter(Boolean);
    onUpdatePaymentNote(index, parts.join(" · "));
  }

  function togglePosProvider(index: number, provider: string) {
    const current = posMeta[index] ?? {};
    const meta = { ...current, provider: current.provider === provider ? "" : provider };
    setPosMeta((prev) => ({ ...prev, [index]: meta }));
    commitPosNote(index, meta);
  }

  function setPosTerminalLabel(index: number, terminalLabel: string) {
    const meta = { ...(posMeta[index] ?? {}), terminalLabel };
    setPosMeta((prev) => ({ ...prev, [index]: meta }));
    commitPosNote(index, meta);
  }

  async function handlePickContact() {
    const picked = await openNativeContactPicker();
    if (picked) {
      if (picked.name) setNewCustomerName(picked.name);
      if (picked.phone) setNewCustomerPhone(picked.phone);
      showToast(`Selected ${picked.name || "contact"}`, "success");
    }
  }

  async function handleAddCreditCustomer() {
    const name = newCustomerName.trim();
    const phone = newCustomerPhone.trim();
    if (!name) {
      showToast("Please enter customer name", "warning");
      return;
    }
    if (!phone) {
      showToast("Phone number is required for credit sales so you can follow up", "warning");
      return;
    }
    const customer = await addCreditCustomer(name, phone);
    onSelectCreditCustomer(customer.id);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setShowNewCustomerForm(false);
    showToast(`${name} added for credit`, "success");
  }

  async function handleSavePhoneToCustomer() {
    if (!creditCustomerId || !missingPhoneInput.trim()) return;
    try {
      setIsSavingCustomerPhone(true);
      const cleanPhone = missingPhoneInput.trim();
      const now = new Date().toISOString();
      await db.customers.update(creditCustomerId, { phone: cleanPhone, updatedAt: now });
      const updated = await db.customers.get(creditCustomerId);
      if (updated) {
        await enqueueOutboxWrite(creditCustomerId, "customer", updated, now);
      }
      setMissingPhoneInput("");
      showToast("Phone number saved to customer profile", "success");
    } catch {
      showToast("Could not save phone number", "danger");
    } finally {
      setIsSavingCustomerPhone(false);
    }
  }
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

  return (
    <div key="payment" className="flex h-full min-w-0 flex-col gap-4 animate-step-in">
      {!hideHeader && <ScreenHeader title="Payment" onBack={onBack} />}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-card)] bg-surface-container-low px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[length:var(--font-size-body)] text-on-surface-muted">
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
            <span className="font-number text-[length:var(--font-size-title)] font-semibold tabular-nums text-on-surface">
              {formatCurrency(total)}
            </span>
          </div>
          {discount !== undefined && discount > 0 && (
            <div className="flex items-center justify-between text-xs border-t border-border/40 pt-1.5 text-on-surface-muted">
              <span>Subtotal {formatCurrency(subtotal ?? total)}</span>
              <span className="text-brand-accent font-medium">−{formatCurrency(discount)} discount</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">Payment method</span>
          {effectivePayments.map((payment, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container-low p-2.5 sm:p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" role="group" aria-label={`Payment method ${index + 1}`}>
                  {PAYMENT_METHODS.map((method) => {
                    const isSelected = payment.method === method;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => onUpdatePaymentMethod(index, method)}
                        aria-pressed={isSelected}
                        className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-all border ${
                          isSelected
                            ? "bg-brand-accent text-on-brand border-brand-accent shadow-xs font-bold"
                            : "bg-surface text-on-surface border-border/40 hover:bg-surface-container"
                        }`}
                      >
                        {PAYMENT_LABELS[method]}
                      </button>
                    );
                  })}
                </div>
                {effectivePayments.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemovePaymentLine(index)}
                    aria-label="Remove this payment method"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-muted shrink-0">Amount</span>
                <input
                  type="number"
                  aria-label={`Payment amount ${index + 1}`}
                  min="0"
                  step="0.01"
                  value={payment.amount}
                  onChange={(event) => onUpdatePaymentAmount(index, event.target.valueAsNumber)}
                  className="min-h-[var(--touch-target-min)] flex-1 min-w-[80px] rounded-[var(--radius-control)] bg-surface border border-border px-3 text-[length:var(--font-size-body)] font-number font-semibold text-on-surface outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                />
              </div>
              {/* Bank transfer audit metadata: provider chips + sender/session ID,
                  composed into the payment's note and printed on the receipt (§9.3) */}
              {payment.method === "transfer" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {TRANSFER_PROVIDERS.map((provider) => {
                      const active = transferMeta[index]?.provider === provider;
                      return (
                        <Chip
                          key={provider}
                          variant="filter"
                          selected={active}
                          onClick={() => toggleTransferProvider(index, provider)}
                        >
                          {provider}
                        </Chip>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    aria-label={`Sender name / session ID for payment ${index + 1}`}
                    placeholder="Sender name / session ID"
                    value={transferMeta[index]?.sender ?? ""}
                    onChange={(e) => setTransferSender(index, e.target.value)}
                    className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-caption)] text-on-surface outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
                  />
                </div>
              )}
              {/* POS Terminal tagging metadata: terminal account chips + custom terminal label */}
              {payment.method === "pos_terminal" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {POS_TERMINAL_PROVIDERS.map((provider) => {
                      const active = posMeta[index]?.provider === provider;
                      return (
                        <Chip
                          key={provider}
                          variant="filter"
                          selected={active}
                          onClick={() => togglePosProvider(index, provider)}
                        >
                          {provider}
                        </Chip>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    aria-label={`Terminal name / account for payment ${index + 1}`}
                    placeholder="Terminal account / label (e.g. Counter 1, Lekki POS)"
                    value={posMeta[index]?.terminalLabel ?? ""}
                    onChange={(e) => setPosTerminalLabel(index, e.target.value)}
                    className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-caption)] text-on-surface"
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
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-container-low p-3">
            <label className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Cash tendered
            </label>

            <div className="flex flex-wrap gap-1.5">
              {quickTenderChips.map((chip) => {
                const active = tenderedAmount === chip.value;
                return (
                  <Chip
                    key={chip.label}
                    variant="filter"
                    selected={active}
                    onClick={() => applyTendered(chip.value)}
                    className="font-number tabular-nums"
                  >
                    {chip.label}
                  </Chip>
                );
              })}
              {tenderedAmount > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => applyTendered(tenderedAmount + 500)}
                    className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-surface-container text-[length:var(--font-size-caption)] font-medium text-on-surface transition-colors px-3 font-number tabular-nums hover:bg-surface-container-high"
                  >
                    +₦500
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTendered(tenderedAmount + 1000)}
                    className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-surface-container text-[length:var(--font-size-caption)] font-medium text-on-surface transition-colors px-3 font-number tabular-nums hover:bg-surface-container-high"
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
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container px-3 text-[length:var(--font-size-body)] text-on-surface tabular-nums outline-none focus:ring-2 focus:ring-brand-accent/20"
            />
            {tenderedAmount > 0 && (
              <div className="flex items-center justify-between">
                {insufficientCash ? (
                  <span className="text-[length:var(--font-size-body)] font-medium text-danger">
                    Not enough. Need {formatCurrency(total - tenderedAmount)} more.
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
          <div className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-container-low p-3">
            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Who&apos;s buying {formatCurrency(creditAmount)} on credit? *
            </span>

            {creditCustomerId ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-container-high px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
                      {selectedCreditCustomer?.name}
                    </span>
                    {selectedCreditCustomer?.phone && (
                      <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {selectedCreditCustomer.phone}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectCreditCustomer(null)}
                    aria-label="Change credit customer"
                    className="min-h-[var(--touch-target-min)] px-2 text-[length:var(--font-size-caption)] font-medium text-brand-accent"
                  >
                    Change
                  </button>
                </div>

                {!creditCustomerHasPhone && selectedCreditCustomer && (
                  <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-warning-container/20 p-3 border border-warning/30">
                    <div className="flex items-center gap-1.5 text-warning font-semibold text-xs">
                      <AlertCircle size={15} />
                      <span>Phone number required for credit sale</span>
                    </div>
                    <p className="text-[11px] text-on-surface-muted">
                      Add a phone number for {selectedCreditCustomer.name} so you can send payment reminders.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        aria-label="Add customer phone number"
                        value={missingPhoneInput}
                        onChange={(e) => setMissingPhoneInput(e.target.value)}
                        placeholder="e.g. 0803 123 4567"
                        className="min-h-[36px] flex-1 rounded-[var(--radius-control)] bg-surface px-2.5 text-xs text-on-surface outline-none border border-border"
                      />
                      <button
                        type="button"
                        disabled={isSavingCustomerPhone || !missingPhoneInput.trim()}
                        onClick={handleSavePhoneToCustomer}
                        className="px-3 py-1 bg-brand-accent text-brand-accent-contrast rounded-[var(--radius-control)] text-xs font-semibold disabled:opacity-50 hover:brightness-105 transition-all"
                      >
                        {isSavingCustomerPhone ? "Saving…" : "Save Phone"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <input
                  type="search"
                  aria-label="Search customer by name or phone"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Search customer by name or phone"
                  className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container px-3 text-[length:var(--font-size-body)] text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20"
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
                  <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container p-2.5">
                    {isContactPickerSupported() && (
                      <button
                        type="button"
                        onClick={handlePickContact}
                        className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border/80 bg-surface px-3 py-1.5 text-xs font-medium text-brand-accent hover:bg-surface-container-high transition-colors"
                      >
                        <BookUser size={15} />
                        <span>Pick from phonebook</span>
                      </button>
                    )}
                    <input
                      aria-label="Customer name"
                      value={newCustomerName}
                      onChange={(event) => setNewCustomerName(event.target.value)}
                      placeholder="Customer name *"
                      className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container-high px-3 text-[length:var(--font-size-body)] text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20"
                    />
                    <div>
                      <input
                        aria-label="Phone (required for credit)"
                        value={newCustomerPhone}
                        onChange={(event) => setNewCustomerPhone(event.target.value)}
                        placeholder="Phone number * (required for credit)"
                        className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container-high px-3 text-[length:var(--font-size-body)] text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20"
                      />
                      <p className="mt-1 text-[11px] text-on-surface-muted">
                        Phone number is required so you can send debt reminders.
                      </p>
                    </div>
                    <RippleButton
                      type="button"
                      onClick={handleAddCreditCustomer}
                      disabled={!newCustomerName.trim() || !newCustomerPhone.trim()}
                      className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50"
                    >
                      Add credit customer
                    </RippleButton>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(true)}
                    aria-label="Add new customer for credit"
                    className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-surface-container px-3 text-[length:var(--font-size-body)] font-medium text-brand-accent hover:bg-surface-container-high transition-colors"
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

      <div className="sticky bottom-0 z-20 mt-auto -mx-gutter sm:-mx-gutter-lg flex flex-col gap-2 border-t border-border/60 bg-surface/95 backdrop-blur-md px-gutter sm:px-gutter-lg pt-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <RippleButton
          id="tour-pos-checkout"
          type="button"
          onClick={onCompleteSale}
          disabled={
            isSubmitting ||
            Math.abs(remaining) > AMOUNT_EPSILON ||
            (hasCreditLine && (!creditCustomerId || !creditCustomerHasPhone)) ||
            insufficientCash
          }
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Completing sale…" : "Complete sale"}
        </RippleButton>

        {hasCreditLine && creditCustomerId && !creditCustomerHasPhone && (
          <p className="text-center text-xs font-medium text-warning">
            Save a phone number for {selectedCreditCustomer?.name} to complete credit sale.
          </p>
        )}

        {!isOnline && (
          <p className="text-center text-[length:var(--font-size-caption)] text-on-surface-muted">
            You&apos;re offline, this sale will sync once you&apos;re back online.
          </p>
        )}
      </div>
    </div>
  );
}
