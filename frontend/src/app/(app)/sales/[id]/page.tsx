"use client";

import { use, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Share2, Ban, RotateCcw, MoreVertical } from "lucide-react";
import { db } from "@/lib/db";
import type { LocalCustomer, LocalUser } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES, WORKER_EXPERIENCE_ACCOUNT_TYPES, hasCapability } from "@/features/auth/authorization";
import { useOnlineStatus } from "@/lib/use-online-status";
import { voidSale, VoidSaleError } from "@/features/pos/void-sale";
import { refundSale, RefundSaleError } from "@/features/pos/refund-sale";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ReceiptIllustration } from "@/components/illustrations";
import type { PaymentMethod, Sale } from "@/types/sale";
import { tenantGet } from "@/lib/local-tenant";

const CAN_VOID_SALE = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank Transfer",
  pos_terminal: "POS",
  credit: "Credit (Owing)",
};

const METHOD_BADGES: Record<PaymentMethod, { bg: string; text: string }> = {
  cash: { bg: "bg-brand-container", text: "text-on-brand-container" },
  transfer: { bg: "bg-info-container", text: "text-on-info-container" },
  pos_terminal: { bg: "bg-terminal-container", text: "text-on-terminal-container" },
  credit: { bg: "bg-credit-container", text: "text-on-credit-container" },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The full record behind one row in /sales — the "sold product card" this
 * app was missing entirely. Never a dead end: back leads to the list,
 * every value that exists is shown, nothing requires guessing at a raw id.
 */
export default function SaleDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const user = useCurrentUser();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [voiding, setVoiding] = useState(false);
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [clientRefundId] = useState(() => crypto.randomUUID());
  const [showMoreActions, setShowMoreActions] = useState(false);

  const sale = useLiveQuery(async () => (await tenantGet<Sale>(db.sales, id)) ?? null, [id]);
  const customer = useLiveQuery(
    async () => (sale?.customerId ? tenantGet<LocalCustomer>(db.customers, sale.customerId) : undefined),
    [sale?.customerId]
  );
  const seller = useLiveQuery(
    async () => (sale?.createdByUserId ? tenantGet<LocalUser>(db.localUsers, sale.createdByUserId) : undefined),
    [sale?.createdByUserId],
  );
  const outboxEntry = useLiveQuery(() => tenantGet<{ status?: string }>(db.outbox, id), [id]);

  if (!hasAccountType(user, WORKER_EXPERIENCE_ACCOUNT_TYPES)) {
    return (
      <div>
        <ScreenHeader title="Sale" backHref="/sales" />
        <PermissionDenied requiredAccountTypes={WORKER_EXPERIENCE_ACCOUNT_TYPES} />
      </div>
    );
  }

  if (sale === undefined) {
    return (
      <div>
        <ScreenHeader title="Sale" backHref="/sales" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (sale === null) {
    return (
      <div>
        <ScreenHeader title="Sale" backHref="/sales" />
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Sale not found.</p>
      </div>
    );
  }

  const canViewBranchSales = hasCapability(user, "VIEW_BRANCH_SALES");
  const workerCanAccessSale = user.accountType !== "WORKER" ||
    (
      user.branchIds?.includes(sale.branchId) &&
      (sale.createdByUserId === user.id || canViewBranchSales)
    );

  if (!workerCanAccessSale) {
    return (
      <div>
        <ScreenHeader title="Sale" backHref="/sales" />
        <PermissionDenied requiredAccountTypes={BUSINESS_MANAGEMENT_ACCOUNT_TYPES} />
      </div>
    );
  }

  const syncStatusLabel = !outboxEntry
    ? "Saved"
    : outboxEntry.status === "failed"
      ? "Needs attention"
      : "Saving…";

  function handleVoid() {
    if (!sale || sale.voidedAt) return;
    setShowVoidConfirm(true);
  }

  async function executeVoid() {
    if (!sale || sale.voidedAt) return;
    setVoiding(true);
    try {
      await voidSale({ saleId: sale.id, branchId: sale.branchId });
      showToast("Sale cancelled. Stock restored.", "success");
      setShowVoidConfirm(false);
    } catch (err) {
      showToast(err instanceof VoidSaleError ? err.message : "Couldn't void this sale.", "danger");
    } finally {
      setVoiding(false);
    }
  }

  async function handleRefund() {
    if (!sale || sale.voidedAt) return;
    if (!refundReason.trim()) {
      showToast("Please enter a reason for the refund.", "danger");
      return;
    }

    setRefunding(true);
    try {
      await refundSale({
        clientRefundId,
        saleId: sale.id,
        branchId: sale.branchId,
        reason: refundReason.trim(),
        items: sale.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
        payments: sale.payments.map((p) => ({
          method: p.method,
          amount: p.amount,
        })),
      });
      setShowRefundModal(false);
      setRefundReason("");
      showToast("Refund processed. Stock restored.", "success");
    } catch (err) {
      showToast(err instanceof RefundSaleError ? err.message : "Couldn't process refund.", "danger");
    } finally {
      setRefunding(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <ScreenHeader title="Sale receipt" backHref="/sales" />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <section className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 animate-step-in">
          <div className="flex min-w-0 items-center gap-3">
            {!sale.voidedAt && <ReceiptIllustration className="h-9 w-9 shrink-0 text-brand-accent" />}
            <div className="min-w-0">
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {new Date(sale.createdAtLocal).toLocaleString("en-NG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{syncStatusLabel}</p>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                Sold by {sale.createdByName ?? seller?.fullName ?? (sale.createdByUserId === user.id ? "you" : "staff member")}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-number text-[length:var(--font-size-title-lg)] font-semibold tabular-nums text-on-surface">
              {formatCurrency(sale.total)}
            </p>
            {sale.voidedAt && <p className="text-[length:var(--font-size-caption)] font-medium text-danger">Cancelled</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Items</h2>
          {sale.items && sale.items.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {sale.items.map((item, index) => {
                return (
                  <li key={index} className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container-low px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--font-size-body)] text-on-surface">
                        <RippleLink
                          href={`/products/${item.productId}`}
                          className="inline-block hover:underline hover:text-brand-accent"
                        >
                          {item.productNameSnapshot ?? "Product name unavailable"}
                        </RippleLink>
                      </p>
                      <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {item.quantity} {item.unitLabel} × {formatCurrency(item.unitPrice)}
                      </p>
                    </div>
                    <p className="shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                      {formatCurrency(item.quantity * item.unitPrice - item.discount)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-[var(--radius-card)] bg-surface-container-low px-3.5 py-3 text-center text-xs text-on-surface-muted">
              No item breakdown recorded for this transaction.
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Payment</h2>
          {sale.payments.length === 1 ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container-low px-4 py-3">
              <span className="text-[length:var(--font-size-body)] text-on-surface">Payment method</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${METHOD_BADGES[sale.payments[0].method]?.bg ?? "bg-surface-container"} ${METHOD_BADGES[sale.payments[0].method]?.text ?? "text-on-surface"}`}>
                {PAYMENT_LABELS[sale.payments[0].method]}
              </span>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {sale.payments.map((payment, index) => (
                <li key={index} className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container-low px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${METHOD_BADGES[payment.method]?.bg ?? "bg-surface-container"} ${METHOD_BADGES[payment.method]?.text ?? "text-on-surface"}`}>
                    {PAYMENT_LABELS[payment.method]}
                  </span>
                  <span className="font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                    {formatCurrency(payment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {customer && (
            <p className="mt-2 text-[length:var(--font-size-body)] text-on-surface-muted">
              Owed by{" "}
              <RippleLink
                href={`/customers/${sale.customerId}`}
                className="font-medium text-on-surface hover:underline hover:text-brand-accent"
              >
                {customer.name}
              </RippleLink>
            </p>
          )}
        </section>
      </div>

      <div className="sticky bottom-0 z-20 mt-auto -mx-gutter sm:-mx-gutter-lg flex gap-2 cta-scrim-container px-gutter sm:px-gutter-lg pt-1.5 pb-[max(0.375rem,calc(env(safe-area-inset-bottom,0px)+0.25rem))] print:hidden transition-all duration-200">
        <RippleLink
          href={`/sales/${sale.id}/share`}
          className="flex min-h-[var(--touch-target-min)] min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
        >
          <Share2 size={18} aria-hidden />
          Share receipt
        </RippleLink>
        {!sale.voidedAt && hasAccountType(user, CAN_VOID_SALE) && (
          <RippleButton
            type="button"
            onClick={() => setShowMoreActions(true)}
            aria-label="More sale actions"
            className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface px-3 text-on-surface hover:bg-surface-container transition-colors"
          >
            <MoreVertical size={20} aria-hidden />
          </RippleButton>
        )}
      </div>

      {showMoreActions && (
        <Modal isOpen={showMoreActions} onClose={() => setShowMoreActions(false)} title="Sale actions" variant="sheet" maxWidth="max-w-md">
          <div className="flex flex-col gap-2">
            {!sale.voidedAt && hasAccountType(user, CAN_VOID_SALE) && (
              <>
            <RippleButton
              type="button"
              onClick={() => { setShowMoreActions(false); setShowRefundModal(true); }}
              disabled={refunding || voiding || !isOnline}
              title={!isOnline ? "Refunding a sale requires an internet connection" : undefined}
              className="flex min-h-[var(--touch-target-min)] w-full items-center gap-3 rounded-[var(--radius-control)] border border-warning/30 bg-surface px-4 text-left text-[length:var(--font-size-body)] font-medium text-warning hover:bg-warning/5 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={18} aria-hidden />
              {isOnline ? "Refund sale" : "Refund (needs internet)"}
            </RippleButton>
            <RippleButton
              type="button"
              onClick={() => { setShowMoreActions(false); handleVoid(); }}
              disabled={voiding || refunding || !isOnline}
              title={!isOnline ? "Voiding a sale requires an internet connection" : undefined}
              className="flex min-h-[var(--touch-target-min)] w-full items-center gap-3 rounded-[var(--radius-control)] border border-danger/30 bg-surface px-4 text-left text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger/5 disabled:opacity-50 transition-colors"
            >
              <Ban size={18} aria-hidden />
              {voiding ? "Voiding…" : isOnline ? "Void sale" : "Void (needs internet)"}
            </RippleButton>
              </>
            )}
          </div>
        </Modal>
      )}

      {showRefundModal && (
        <Modal
          isOpen={showRefundModal}
          onClose={() => setShowRefundModal(false)}
          title="Refund Sale"
        >
          <div className="flex flex-col gap-4">
            <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
              Processing a refund will return all items to inventory stock and reverse payments of{" "}
              <strong className="text-on-surface">{formatCurrency(sale.total)}</strong>.
            </p>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="refund-reason"
                className="text-[length:var(--font-size-caption)] font-medium text-on-surface"
              >
                Reason for refund <span className="text-danger">*</span>
              </label>
              <input
                id="refund-reason"
                type="text"
                placeholder="e.g. Defective item, customer return"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="min-h-[44px] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-accent"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <RippleButton
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="min-h-[44px] flex-1 rounded-[var(--radius-control)] border border-border bg-surface text-on-surface font-medium hover:bg-surface-container"
              >
                Cancel
              </RippleButton>
              <RippleButton
                type="button"
                onClick={handleRefund}
                disabled={refunding || !refundReason.trim() || !isOnline}
                className="min-h-[44px] flex-1 rounded-[var(--radius-control)] bg-brand-accent text-brand-accent-contrast font-medium hover:opacity-95 disabled:opacity-50"
              >
                {refunding ? "Processing…" : "Confirm Refund"}
              </RippleButton>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={showVoidConfirm}
        onClose={() => setShowVoidConfirm(false)}
        onConfirm={executeVoid}
        isBusy={voiding}
        title="Void this sale?"
        description="All items will be returned to inventory and this sale will be marked void. This cannot be undone."
        confirmLabel="Void sale"
        cancelLabel="Keep sale"
        variant="danger"
      />
    </div>
  );
}
