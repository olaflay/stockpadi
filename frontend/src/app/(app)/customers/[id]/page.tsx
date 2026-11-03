"use client";

import { use, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileImage, FileText, MessageCircle, Share2 } from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { getCustomerCreditBalance } from "@/features/customers/credit";
import { recordCreditPayment } from "@/features/customers/record-payment";
import { buildWhatsAppUrl, renderOwingMessage } from "@/lib/whatsapp";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/Toast";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { ErrorState } from "@/components/ui/ErrorState";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { tenantArray, tenantGet } from "@/lib/local-tenant";
import { getBrandingConfig } from "@/config/branding";
import type { LocalCustomer, CustomerCreditMovement } from "@/lib/db";
import { shareCreditStatementImage, shareCreditStatementPdf } from "@/features/customers/credit-statement-share";


interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const user = useCurrentUser();
  const canRecordPayment = hasCapability(user, "RECORD_REPAYMENT");
  const { showToast } = useToast();

  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState<"pdf" | "image" | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const result = useLiveQuery(async () => {
    try {
      const [customer, movements, balance, profile] = await Promise.all([
        tenantGet<LocalCustomer>(db.customers, id),
        tenantArray<CustomerCreditMovement>(db.customerCreditMovements.where("customerId").equals(id)),
        getCustomerCreditBalance(id),
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
      ]);
      setLoadError(null);
      return { customer, movements, balance, profile };
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this customer.");
      return undefined;
    }
  }, [id]);

  if (!hasCapability(user, "VIEW_CUSTOMERS")) {
    return (
      <div>
        <ScreenHeader title="Customer" backHref="/customers" />
        <PermissionDenied requiredCapabilities={["VIEW_CUSTOMERS"]} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div>
        <ScreenHeader title="Customer" backHref="/customers" />
        <ErrorState message="Couldn't load this customer." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Customer" backHref="/customers" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const { customer, movements, balance, profile } = result;

  if (!customer) {
    return (
      <div>
        <ScreenHeader title="Customer" backHref="/customers" />
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
    const shopName = profile?.name ?? getBrandingConfig().businessName;
    const message = renderOwingMessage(profile?.owingMessageTemplate, {
      customerName: customer.name,
      businessName: shopName,
      amountOwed: formatCurrency(Math.max(balance ?? 0, 0)),
    });
    window.open(buildWhatsAppUrl(customer.phone, message), "_blank", "noopener,noreferrer");
  }

  async function handleShareStatement(kind: "pdf" | "image") {
    if (!customer) return;
    setSharing(kind);
    try {
      const statement = {
        businessName: profile?.name ?? getBrandingConfig().businessName,
        customerName: customer.name,
        customerPhone: customer.phone,
        balance,
        generatedAt: new Date(),
        movements,
      };
      const outcome = kind === "pdf" ? await shareCreditStatementPdf(statement) : await shareCreditStatementImage(statement);
      showToast(outcome === "shared" ? "Statement shared" : "Statement downloaded", "success");
      setShareOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("We couldn't prepare the statement. Try again.", "danger");
    } finally {
      setSharing(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title={customer.name} backHref="/contacts" />

      <div className="rounded-[var(--radius-focus-block)] border border-credit/20 bg-credit-container p-5 text-center">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Balance owed</p>
        <p className="mt-1 font-number text-[length:var(--font-size-display)] font-bold tabular-nums text-on-credit-container">
          {formatCurrency(Math.max(balance, 0))}
        </p>
        {customer.phone && <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">{customer.phone}</p>}
      </div>

      <div className="flex flex-col gap-2 print:hidden">
        <div className="flex gap-2">
          {canRecordPayment && (
            <RippleButton
              type="button"
              onClick={() => setRecording((v) => !v)}
              className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
            >
              Record payment
            </RippleButton>
          )}
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
          onClick={() => setShareOpen(true)}
          aria-label={`Share debt statement for ${customer.name}`}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container transition-colors"
        >
          <Share2 size={18} aria-hidden />
          Share statement
        </button>
      </div>

      <Modal isOpen={shareOpen} onClose={() => setShareOpen(false)} title="Share debt statement" variant="sheet">
        <div className="flex flex-col gap-3">
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Choose a format. On supported phones, the share menu will open; otherwise the file will download.
          </p>
          <RippleButton type="button" onClick={() => handleShareStatement("pdf")} disabled={sharing !== null} className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-credit px-4 font-semibold text-on-credit disabled:opacity-50">
            <FileText size={18} aria-hidden />{sharing === "pdf" ? "Preparing…" : "Share PDF"}
          </RippleButton>
          <RippleButton type="button" onClick={() => handleShareStatement("image")} disabled={sharing !== null} className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-credit/30 bg-credit-container px-4 font-semibold text-on-credit-container disabled:opacity-50">
            <FileImage size={18} aria-hidden />{sharing === "image" ? "Preparing…" : "Share image"}
          </RippleButton>
        </div>
      </Modal>

      <Modal
        isOpen={recording}
        onClose={() => setRecording(false)}
        title={`Record payment: ${customer.name}`}
        variant="sheet"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-card)] bg-surface-container p-3.5 text-center">
            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">Current balance owed</span>
            <p className="font-number text-[length:var(--font-size-title)] font-bold tabular-nums text-on-surface">
              {formatCurrency(Math.max(balance, 0))}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Amount received (₦) *</span>
            <TextInput
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={`e.g. ${Math.max(balance, 0)}`}
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Note (optional)</span>
            <TextInput
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Cash collected in shop"
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
                    className={`shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums ${
                      movement.amountDelta > 0 ? "text-credit" : "text-success"
                    }`}
                  >
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
