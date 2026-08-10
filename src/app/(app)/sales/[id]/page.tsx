"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { MessageCircle, Printer, Ban } from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { useToast } from "@/components/ui/Toast";
import { RippleButton, RippleLink } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { useOnlineStatus } from "@/lib/use-online-status";
import { voidSale, VoidSaleError } from "@/features/pos/void-sale";
import { ReceiptIllustration } from "@/components/illustrations";
import type { PaymentMethod } from "@/types/sale";

// Matches PERMISSION_MATRIX.void_sale in src/types/permissions.ts.
const CAN_VOID_SALE = ["owner", "manager", "admin"] as const;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank Transfer",
  pos_terminal: "POS",
  credit: "Credit (Owing)",
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
  const router = useRouter();
  const { showToast } = useToast();
  const isOnline = useOnlineStatus();

  const [manualPhone, setManualPhone] = useState("");
  const [voiding, setVoiding] = useState(false);

  const sale = useLiveQuery(() => db.sales.get(id), [id]);
  const products = useLiveQuery(() => db.products.toArray(), [], []);
  const customer = useLiveQuery(
    async () => (sale?.customerId ? db.customers.get(sale.customerId) : undefined),
    [sale?.customerId]
  );
  const outboxEntry = useLiveQuery(() => db.outbox.get(id), [id]);
  const businessProfile = useLiveQuery(() => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID), [], undefined);

  if (!hasRole(user, ["owner", "manager", "cashier", "accountant", "admin"])) {
    return (
      <div>
        <ScreenHeader title="Sale" onBack={() => router.push("/sales")} />
        <PermissionDenied requiredRoles={["owner", "manager", "cashier", "accountant", "admin"]} />
      </div>
    );
  }

  if (sale === undefined) {
    return (
      <div>
        <ScreenHeader title="Sale" onBack={() => router.push("/sales")} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (sale === null) {
    return (
      <div>
        <ScreenHeader title="Sale" onBack={() => router.push("/sales")} />
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Sale not found.</p>
      </div>
    );
  }

  if (user.role === "cashier" && sale.createdByUserId !== user.id) {
    return (
      <div>
        <ScreenHeader title="Sale" onBack={() => router.push("/sales")} />
        <PermissionDenied requiredRoles={["owner", "manager", "accountant", "admin"]} />
      </div>
    );
  }

  const syncStatusLabel = !outboxEntry
    ? "Synced"
    : outboxEntry.status === "failed"
      ? "Didn't sync"
      : "Syncing…";

  function shareReceipt() {
    if (!sale) return;
    const businessName = businessProfile?.name ?? "Receipt";
    const lines = sale.items.map((item) => {
      const product = products?.find((p) => p.id === item.productId);
      return `${item.quantity} ${item.unitLabel} × ${product?.name ?? "Item"} - ${formatCurrency(item.unitPrice * item.quantity - item.discount)}`;
    });
    const message =
      `*${businessName}*\n` +
      `${new Date(sale.createdAtLocal).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}\n\n` +
      `${lines.join("\n")}\n\n` +
      `Total: ${formatCurrency(sale.total)}`;
    // Shares to the credit customer's own number when there is one on file;
    // otherwise falls back to WhatsApp's contact picker, per
    // src/lib/whatsapp.ts.
    const phone = customer?.phone || manualPhone;
    if (!phone) {
      alert("Please enter a WhatsApp number.");
      return;
    }
    window.open(buildWhatsAppUrl(phone, message), "_blank");
  }

  async function handleVoid() {
    if (!sale || sale.voidedAt) return;
    if (!window.confirm("Void this sale? Stock will be added back and this can't be undone.")) return;

    setVoiding(true);
    try {
      await voidSale({ saleId: sale.id, branchId: sale.branchId });
      showToast("Sale voided — stock has been restored.", "success");
    } catch (err) {
      showToast(err instanceof VoidSaleError ? err.message : "Couldn't void this sale.", "danger");
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <ScreenHeader title="Sale receipt" onBack={() => router.push("/sales")} />

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
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[length:var(--font-size-title-lg)] font-semibold text-on-surface">
              {formatCurrency(sale.total)}
            </p>
            {sale.voidedAt && <p className="text-[length:var(--font-size-caption)] font-medium text-danger">Cancelled</p>}
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Items</h2>
          <ul className="divide-y divide-border">
            {sale.items.map((item, index) => {
              const product = products?.find((p) => p.id === item.productId);
              return (
                <li key={index} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--font-size-body)] text-on-surface">
                      <RippleLink
                        href={`/products/${item.productId}`}
                        className="inline-block hover:underline hover:text-brand-accent"
                      >
                        {product?.name ?? "Unknown product"}
                      </RippleLink>
                    </p>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {item.quantity} {item.unitLabel} × {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[length:var(--font-size-body)] font-medium text-on-surface">
                    {formatCurrency(item.quantity * item.unitPrice - item.discount)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Payment</h2>
          {sale.payments.length === 1 ? (
            <p className="text-[length:var(--font-size-body)] text-on-surface">
              Paid: <span className="font-medium">{PAYMENT_LABELS[sale.payments[0].method]}</span>
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {sale.payments.map((payment, index) => (
                <li key={index} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-[length:var(--font-size-body)] text-on-surface">
                    {PAYMENT_LABELS[payment.method]}
                  </span>
                  <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
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

      {!customer && (
        <section className="px-4 print:hidden">
          <label className="mb-1 block text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
            Share to customer
          </label>
          <input
            type="tel"
            placeholder="WhatsApp number..."
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value)}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-border bg-surface px-4 pt-3 pb-4 print:hidden">
        <RippleButton
          type="button"
          onClick={shareReceipt}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
        >
          <MessageCircle size={18} aria-hidden />
          Share receipt on WhatsApp
        </RippleButton>
        <RippleButton
          type="button"
          onClick={() => window.print()}
          className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-5 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
        >
          <Printer size={18} aria-hidden />
          Print receipt
        </RippleButton>
        {!sale.voidedAt && hasRole(user, [...CAN_VOID_SALE]) && (
          <RippleButton
            type="button"
            onClick={handleVoid}
            disabled={voiding || !isOnline}
            title={!isOnline ? "Voiding a sale requires an internet connection" : undefined}
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-danger/30 bg-surface px-5 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger/5 disabled:opacity-50 transition-colors"
          >
            <Ban size={18} aria-hidden />
            {voiding ? "Voiding…" : isOnline ? "Void sale" : "Void sale (needs internet)"}
          </RippleButton>
        )}
      </div>
    </div>
  );
}
