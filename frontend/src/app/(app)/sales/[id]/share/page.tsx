"use client";

import { use, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileImage, FileText } from "lucide-react";
import { db, BUSINESS_PROFILE_SINGLETON_ID, type LocalCustomer, type LocalUser } from "@/lib/db";
import type { Sale } from "@/types/sale";
import type { Product } from "@/types/product";
import { tenantArray, tenantGet } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleButton } from "@/components/ui/Ripple";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { getBrandingConfig } from "@/config/branding";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES, WORKER_EXPERIENCE_ACCOUNT_TYPES, hasCapability } from "@/features/auth/authorization";
import { createReceiptViewModel } from "@/features/pos/receipt-view-model";
import { shareReceiptImage, shareReceiptPdf } from "@/features/pos/receipt-share";

interface PageProps { params: Promise<{ id: string }>; }

export default function ShareReceiptPage({ params }: PageProps) {
  const { id } = use(params);
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [sharing, setSharing] = useState<"pdf" | "image" | null>(null);
  const sale = useLiveQuery(async () => (await tenantGet<Sale>(db.sales, id)) ?? null, [id]);
  const customer = useLiveQuery(async () => sale?.customerId ? tenantGet<LocalCustomer>(db.customers, sale.customerId) : null, [sale?.customerId]);
  const seller = useLiveQuery(async () => sale?.createdByUserId ? tenantGet<LocalUser>(db.localUsers, sale.createdByUserId) : null, [sale?.createdByUserId]);
  const products = useLiveQuery(() => tenantArray<Product>(db.products), [], []);
  const profile = useLiveQuery(() => db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID), [], undefined);

  const receipt = useMemo(() => sale ? createReceiptViewModel({
    sale,
    businessName: profile?.name ?? getBrandingConfig().businessName,
    customerName: customer?.name ?? null,
    cashierName: sale.createdByName ?? seller?.fullName ?? null,
    legacyProductNames: new Map((products ?? []).map((product) => [product.id, product.name])),
  }) : null, [sale, profile?.name, customer?.name, seller?.fullName, products]);

  if (!hasAccountType(user, WORKER_EXPERIENCE_ACCOUNT_TYPES)) return <><ScreenHeader title="Receipt" backHref={`/sales/${id}`} /><PermissionDenied requiredAccountTypes={WORKER_EXPERIENCE_ACCOUNT_TYPES} /></>;
  if (sale === undefined || !receipt) return <><ScreenHeader title="Receipt" backHref={`/sales/${id}`} /><Skeleton className="h-80" /></>;
  if (sale === null) return <><ScreenHeader title="Receipt" backHref="/sales" /><p className="text-[length:var(--font-size-body)] text-on-surface-muted">Sale not found.</p></>;
  const canViewBranchSales = hasCapability(user, "VIEW_BRANCH_SALES");
  const allowed = user.accountType !== "WORKER" || (user.branchIds?.includes(sale.branchId) && (sale.createdByUserId === user.id || canViewBranchSales));
  if (!allowed) return <><ScreenHeader title="Receipt" backHref={`/sales/${id}`} /><PermissionDenied requiredAccountTypes={BUSINESS_MANAGEMENT_ACCOUNT_TYPES} /></>;
  const currentReceipt = receipt;

  async function share(kind: "pdf" | "image") {
    setSharing(kind);
    try {
      const result = kind === "pdf" ? await shareReceiptPdf(currentReceipt) : await shareReceiptImage(currentReceipt);
      showToast(result === "shared" ? "Receipt ready to share" : "Receipt downloaded", "success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showToast("Could not prepare the receipt. Please try again.", "danger");
    } finally { setSharing(null); }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ScreenHeader title="Share receipt" backHref={`/sales/${id}`} />
      <main className="flex-1 overflow-y-auto pb-2" aria-label="Receipt preview">
        <article className="mx-auto max-w-md rounded-[var(--radius-card)] border border-border bg-surface px-4 py-5 shadow-[var(--shadow-elevation-1)]">
          <header className="border-b border-dashed border-border pb-4 text-center">
            <h1 className="text-[length:var(--font-size-title-lg)] font-semibold text-on-surface">{receipt.businessName}</h1>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-on-surface-muted">Receipt #{receipt.receiptNumber}</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{receipt.dateLabel}</p>
            {receipt.voidedAt && <p className="mt-2 text-[length:var(--font-size-caption)] font-semibold text-danger">Cancelled</p>}
          </header>
          <section className="py-4">
            <h2 className="sr-only">Items</h2>
            <ul className="space-y-3">
              {receipt.items.map((item, index) => <li key={index} className="flex gap-3 text-[length:var(--font-size-body)]">
                <div className="min-w-0 flex-1"><p className="truncate text-on-surface">{item.name}</p><p className="text-[length:var(--font-size-caption)] text-on-surface-muted">{item.quantity} {item.unitLabel} × {formatCurrency(item.unitPrice)}</p></div>
                <span className="shrink-0 font-number tabular-nums text-on-surface">{formatCurrency(item.total)}</span>
              </li>)}</ul>
          </section>
          <section className="border-t border-dashed border-border pt-3 text-[length:var(--font-size-body)]">
            <div className="flex justify-between text-on-surface-muted"><span>Subtotal</span><span className="font-number tabular-nums">{formatCurrency(receipt.subtotal)}</span></div>
            {receipt.discount > 0 && <div className="mt-2 flex justify-between text-on-surface-muted"><span>Discount</span><span className="font-number tabular-nums">−{formatCurrency(receipt.discount)}</span></div>}
            <div className="mt-3 flex justify-between border-t border-border pt-3 text-[length:var(--font-size-title-lg)] font-semibold text-on-surface"><span>Total</span><span className="font-number tabular-nums">{formatCurrency(receipt.total)}</span></div>
          </section>
          <section className="mt-4 border-t border-dashed border-border pt-3"><h2 className="text-[length:var(--font-size-caption)] font-medium uppercase tracking-wide text-on-surface-muted">Payment</h2>{receipt.payments.map((payment, index) => <div className="mt-2 flex justify-between text-[length:var(--font-size-body)] text-on-surface" key={index}><span className="capitalize">{payment.method.replace("_", " ")}</span><span className="font-number tabular-nums">{formatCurrency(payment.amount)}</span></div>)}</section>
          {receipt.usesCurrentCatalogLabels && <p className="mt-4 border-t border-dashed border-border pt-3 text-[length:var(--font-size-caption)] text-on-surface-muted">Some legacy item names use today&apos;s catalogue labels.</p>}
        </article>
      </main>
      <div className="sticky bottom-0 -mx-gutter flex gap-2 cta-scrim-container px-gutter pb-[max(0.375rem,calc(env(safe-area-inset-bottom,0px)+0.25rem))] pt-1.5 sm:-mx-gutter-lg sm:px-gutter-lg">
        <RippleButton type="button" onClick={() => share("pdf")} disabled={sharing !== null} className="flex min-h-[var(--touch-target-min)] min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-3 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50"><FileText size={18} aria-hidden />{sharing === "pdf" ? "Preparing…" : "Share PDF"}</RippleButton>
        <RippleButton type="button" onClick={() => share("image")} disabled={sharing !== null} className="flex min-h-[var(--touch-target-min)] min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] font-medium text-on-surface disabled:opacity-50"><FileImage size={18} aria-hidden />{sharing === "image" ? "Preparing…" : "Share image"}</RippleButton>
      </div>
    </div>
  );
}
