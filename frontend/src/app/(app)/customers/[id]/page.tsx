"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { MessageCircle, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import { recordCreditPayment } from "@/features/customers/record-payment";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ErrorState } from "@/components/ui/ErrorState";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { WORKER_EXPERIENCE_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { tenantArray, tenantGet } from "@/lib/local-tenant";
import type { LocalCustomer, CustomerCreditMovement } from "@/lib/db";

// Matches customer_credit_movements_insert RLS policy — see the comment on
// ROLES_ALLOWED_TO_RECORD_PAYMENT in src/features/customers/record-payment.ts.
const CAN_VIEW_CUSTOMER_DETAIL = WORKER_EXPERIENCE_ACCOUNT_TYPES;

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();

  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const result = useLiveQuery(async () => {
    try {
      const [customer, movements, balance] = await Promise.all([
        tenantGet<LocalCustomer>(db.customers, id),
        tenantArray<CustomerCreditMovement>(db.customerCreditMovements.where("customerId").equals(id)),
        getCustomerCreditBalance(id),
      ]);
      setLoadError(null);
      return { customer, movements, balance };
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this customer.");
      return undefined;
    }
  }, [id]);

  if (!hasAccountType(user, CAN_VIEW_CUSTOMER_DETAIL)) {
    return (
      <div>
        <ScreenHeader title="Customer" onBack={() => router.push("/customers")} />
        <PermissionDenied requiredAccountTypes={CAN_VIEW_CUSTOMER_DETAIL} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <ScreenHeader title="Customer" onBack={() => router.push("/customers")} />
        <ErrorState message="Couldn't load this customer." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Customer" onBack={() => router.push("/customers")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { customer, movements, balance } = result;

  if (!customer) {
    return (
      <div>
        <ScreenHeader title="Customer" onBack={() => router.push("/customers")} />
        <p className="text-center text-[length:var(--font-size-body)] text-on-surface-muted">Not found.</p>
      </div>
    );
  }

  const sortedMovements = [...movements].sort((a, b) => b.createdAtLocal.localeCompare(a.createdAtLocal));

  async function handleRecordPayment() {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast("Enter a valid amount.", "danger");
      return;
    }

    setBusy(true);
    try {
      await recordCreditPayment({
        customerId: id,
        amount: parsedAmount,
        note: note.trim() || null,
        createdByUserId: user.id,
        actor: user,
      });
      showToast("Payment recorded", "success");
      setRecording(false);
      setAmount("");
      setNote("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't record payment.", "danger");
    } finally {
      setBusy(false);
    }
  }

  function handleRemind() {
    if (!customer) return;
    const message = `Hi ${customer.name}, this is a friendly reminder from ${
      process.env.NEXT_PUBLIC_BUSINESS_NAME ?? "us"
    } — your outstanding balance is ${formatCurrency(Math.max(balance ?? 0, 0))}. Please pay at your convenience. Thank you!`;
    window.open(buildWhatsAppUrl(customer.phone, message), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={customer.name} onBack={() => router.push("/customers")} />

      <div className="rounded-[var(--radius-focus-block)] bg-surface-container p-5 text-center">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Balance owed</p>
        <p className="mt-1 text-[length:var(--font-size-display)] font-semibold text-on-surface">
          {formatCurrency(Math.max(balance, 0))}
        </p>
        {customer.phone && <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">{customer.phone}</p>}
      </div>

      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex gap-2">
          <RippleButton
            type="button"
            onClick={() => setRecording((v) => !v)}
            className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
          >
            Record payment
          </RippleButton>
          <button
            type="button"
            onClick={handleRemind}
            disabled={!customer.phone}
            aria-label={`Send WhatsApp payment reminder to ${customer.name}`}
            className="flex min-h-[var(--touch-target-min)] flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] text-on-surface disabled:opacity-50 hover:bg-surface-container transition-colors"
          >
            <MessageCircle size={18} aria-hidden />
            Remind
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          aria-label={`Print credit statement for ${customer.name}`}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container transition-colors"
        >
          <Printer size={18} aria-hidden />
          Print statement
        </button>
      </div>

      <Modal
        isOpen={recording}
        onClose={() => setRecording(false)}
        title={`Record payment: ${customer.name}`}
        variant="sheet"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-card)] bg-surface-container p-3.5 text-center">
            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">Current balance owed</span>
            <p className="text-[length:var(--font-size-title)] font-bold text-on-surface">
              {formatCurrency(Math.max(balance, 0))}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Amount received (₦) *</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={`e.g. ${Math.max(balance, 0)}`}
              className={inputClass}
              inputMode="decimal"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Cash collected in shop"
              className={inputClass}
            />
          </label>
          <div className="pt-2">
            <RippleButton
              type="button"
              onClick={handleRecordPayment}
              disabled={busy || !amount || Number(amount) <= 0}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
            >
              {busy ? "Saving…" : "Save Payment"}
            </RippleButton>
          </div>
        </div>
      </Modal>

      <section>
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">History</h2>
        {sortedMovements.length === 0 ? (
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">No activity yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">
            {sortedMovements.map((movement) => {
              const content = (
                <>
                  <div className="min-w-0">
                    <p className="text-[length:var(--font-size-body)] text-on-surface">
                      {movement.amountDelta > 0 ? "Credit sale" : "Payment received"}
                    </p>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {new Date(movement.createdAtLocal).toLocaleString()}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-[length:var(--font-size-body)] font-medium ${
                      movement.amountDelta > 0 ? "text-on-surface" : "text-success"
                    }`}
                  >
                    {movement.amountDelta > 0 ? "+" : ""}
                    {formatCurrency(movement.amountDelta)}
                  </p>
                </>
              );

              if (movement.amountDelta > 0 && movement.sourceReferenceId) {
                return (
                  <RippleLink
                    key={movement.id}
                    href={`/sales/${movement.sourceReferenceId}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container transition-colors"
                  >
                    {content}
                  </RippleLink>
                );
              }

              return (
                <div key={movement.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
