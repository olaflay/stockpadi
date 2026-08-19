"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { WORKER_EXPERIENCE_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { BalancedIllustration } from "@/components/illustrations";
import { computeGrossProfit, computeNetProfit } from "@/features/reports/compute-profit";
import type { PaymentMethod } from "@/types/sale";
import { serverGet } from "@/features/operations/server-client";
import { fetchReconciliationHistory, submitReconciliation, type ReconciliationRecord } from "@/features/reconciliation/reconciliation-client";
import { tenantArray } from "@/lib/local-tenant";
import type { Expense } from "@/types/expense";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";

const CAN_CLOSE_DAY = WORKER_EXPERIENCE_ACCOUNT_TYPES;

type ServerPayment = { method: PaymentMethod; amount: number };
type ServerSale = { id: string; client_id?: string; branch_id: string; customer_id?: string | null; subtotal: number; discount: number; total: number; created_at: string; created_by_user_id: string; voided_at?: string | null; items?: Array<{ product_id: string; quantity: number; unit_price: number; discount: number; unit_label: string; unit_conversion_factor: number }>; payments?: ServerPayment[] };
type ServerProduct = { id: string; name: string; cost_price: number; sell_price: number };
type ServerExpense = { id: string; amount: number; category: string; branch_id: string | null; note: string | null; created_at: string; created_by_user_id: string };
type CloseDayResponse = { sales?: ServerSale[]; products?: ServerProduct[]; expenses?: ServerExpense[] };

/**
 * The ritual every shop owner does at night, promoted to its own screen
 * (docs/RESEARCH-AND-PLAN.md Phase 1 item 10 — it previously lived as a
 * modal buried inside Reports). Reachable from Dashboard and Reports alike.
 */
export default function CloseDayPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [countedCashInput, setCountedCashInput] = useState("");
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<ReconciliationRecord[]>([]);

  useEffect(() => { fetchReconciliationHistory().then((result) => setHistory(result.records)).catch(() => setHistory([])); }, []);

  const result = useLiveQuery(async () => {
    try {
      try {
        const remote = await serverGet<CloseDayResponse>("/api/reconciliation/summary");
        const sales: Sale[] = (remote.sales ?? []).map((sale) => ({ id: sale.id, clientId: sale.client_id ?? sale.id, branchId: sale.branch_id, customerId: sale.customer_id ?? null, subtotal: Number(sale.subtotal), discount: Number(sale.discount), total: Number(sale.total), createdAtLocal: sale.created_at, createdAt: sale.created_at, createdByUserId: sale.created_by_user_id, voidedAt: sale.voided_at ?? null, items: (sale.items ?? []).map((item) => ({ productId: item.product_id, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), discount: Number(item.discount), unitLabel: item.unit_label, conversionFactor: Number(item.unit_conversion_factor), movementClientId: "server" })), payments: (sale.payments ?? []).map((payment) => ({ method: payment.method, amount: Number(payment.amount) })) }));
        const products: Product[] = (remote.products ?? []).map((product) => ({ id: product.id, name: product.name, sku: product.id, barcode: null, categoryId: null, brandId: null, unitLabel: "piece", altUnitLabel: null, altUnitConversionFactor: null, altUnitSellPrice: null, costPrice: Number(product.cost_price), sellPrice: Number(product.sell_price), expiryTracking: "off", expiryDate: null, lowStockThreshold: null, version: 1, updatedAt: new Date().toISOString() }));
        const expenses: Expense[] = (remote.expenses ?? []).map((expense) => ({ id: expense.id, amount: Number(expense.amount), category: expense.category, branchId: expense.branch_id, note: expense.note, createdAtLocal: expense.created_at, createdByUserId: expense.created_by_user_id }));
        return { sales, products, expenses, profile: undefined, error: null as string | null };
      } catch { /* offline fallback below */ }
      const [sales, products, expenses, profile] = await Promise.all([
        tenantArray<Sale>(db.sales),
        tenantArray<Product>(db.products),
        tenantArray<Expense>(db.expenses),
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
      ]);
      return { sales, products, expenses, profile, error: null as string | null };
    } catch (err) {
      return {
        sales: [],
        products: [],
        expenses: [],
        profile: undefined,
        error: err instanceof Error ? err.message : "Could not load today's sales.",
      };
    }
  }, []);

  if (!hasAccountType(user, CAN_CLOSE_DAY)) {
    return (
      <div>
        <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />
        <PermissionDenied requiredAccountTypes={CAN_CLOSE_DAY} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />
        <ErrorState message="Couldn't load today's sales." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const todaySales = result.sales.filter((sale: Sale) => !sale.voidedAt && sale.createdAtLocal >= todayIso);
  const todaySalesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const todayExpenses = result.expenses.filter((expense: Expense) => expense.createdAtLocal >= todayIso);
  const todayExpensesTotal = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  // A sale can be split across methods (docs/RESEARCH-AND-PLAN.md finding
  // 1.1-A), so these sum the per-payment amounts, not whole sales grouped by
  // a single tag — one sale can now contribute to more than one bucket.
  const totalByMethod = (method: PaymentMethod) =>
    todaySales.reduce(
      (sum, sale) => sum + (sale.payments ?? []).filter((payment) => payment.method === method).reduce((paymentSum, payment) => paymentSum + payment.amount, 0),
      0
    );
  const cashTotal = totalByMethod("cash");
  const transferTotal = totalByMethod("transfer");
  const posTotal = totalByMethod("pos_terminal");
  const creditTotal = totalByMethod("credit");

  const grossProfit = computeGrossProfit(todaySales, result.products);
  const netProfit = computeNetProfit(grossProfit, todayExpenses);
  const whatsappNumber = result.profile?.whatsappNumber;

  const counted = Number(countedCashInput);
  const hasCount = countedCashInput.trim() !== "" && !Number.isNaN(counted);
  const variance = hasCount ? counted - cashTotal : null;
  const isBalanced = hasCount && Math.abs(variance ?? 0) < 0.5;

  async function submitCloseDay() {
    if (!hasCount || reconciliationBusy) return;
    const branchId = (await tenantArray(db.branches))[0]?.id;
    if (!branchId) { setReconciliationMessage("No branch is assigned to this account."); return; }
    setReconciliationBusy(true);
    setReconciliationMessage(null);
    try {
      const record = await submitReconciliation({ branchId, actualCash: counted, expectedCash: cashTotal, expectedTransfer: transferTotal, expectedPos: posTotal, expectedCredit: creditTotal, discrepancy: variance ?? 0, note: null });
      setHistory((current) => [record, ...current]);
      setReconciliationMessage("Close day saved.");
    } catch (error) { setReconciliationMessage(error instanceof Error ? error.message : "Could not save close day."); }
    finally { setReconciliationBusy(false); }
  }

  function shareOnWhatsApp() {
    const shareMessage =
      `*Close Day Summary - ${new Date().toLocaleDateString("en-NG")}*\n` +
      `Sales: ${formatCurrency(todaySalesTotal)}\n` +
      `Transactions: ${todaySales.length}\n` +
      `Cash: ${formatCurrency(cashTotal)}\n` +
      `Transfer: ${formatCurrency(transferTotal)}\n` +
      `POS: ${formatCurrency(posTotal)}\n` +
      `Credit: ${formatCurrency(creditTotal)}\n` +
      `Expenses: ${formatCurrency(todayExpensesTotal)}\n` +
      `Est. Net Profit: ${formatCurrency(netProfit)}` +
      (hasCount
        ? `\nCash counted: ${formatCurrency(counted)} (${
            isBalanced ? "balanced" : (variance ?? 0) > 0 ? `+${formatCurrency(variance ?? 0)}` : `-${formatCurrency(-(variance ?? 0))}`
          })`
        : "");
    // Shares straight to the owner's own number, set once in Settings —
    // never WhatsApp's contact picker. Falls back to the picker only if no
    // number has been saved yet.
    window.open(buildWhatsAppUrl(whatsappNumber, shareMessage), "_blank");
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />

      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <div className="flex justify-between">
          <span className="text-on-surface-muted">Today&apos;s sales</span>
          <span className="font-semibold text-on-surface">{formatCurrency(todaySalesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-muted">Transactions</span>
          <span className="font-semibold text-on-surface">{todaySales.length}</span>
        </div>
        <hr className="border-border" />
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Cash</span>
          <span className="font-medium text-on-surface">{formatCurrency(cashTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Transfer</span>
          <span className="font-medium text-on-surface">{formatCurrency(transferTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">POS Terminal</span>
          <span className="font-medium text-on-surface">{formatCurrency(posTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Customer credit</span>
          <span className="font-medium text-on-surface">{formatCurrency(creditTotal)}</span>
        </div>
        <hr className="border-border" />
        <div className="flex justify-between text-[length:var(--font-size-body)]">
          <span className="text-on-surface-muted">Expenses today</span>
          <span className="font-medium text-on-surface">−{formatCurrency(todayExpensesTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-muted">Est. net profit</span>
          <span className={`font-semibold ${netProfit >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(netProfit)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Cash counted in drawer</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={countedCashInput}
            onChange={(event) => setCountedCashInput(event.target.value)}
            placeholder={formatCurrency(cashTotal)}
            className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
        </label>
        {hasCount &&
          (isBalanced ? (
            <div className="flex items-center gap-2 animate-step-in">
              <BalancedIllustration className="h-10 w-10 shrink-0" />
              <p className="text-[length:var(--font-size-body)] font-medium text-success">
                Balanced - matches expected cash sales.
              </p>
            </div>
          ) : (
            <p className={`text-[length:var(--font-size-body)] font-medium ${(variance ?? 0) > 0 ? "text-warning" : "text-danger"}`}>
              {(variance ?? 0) > 0
                ? `${formatCurrency(variance ?? 0)} more than expected.`
                : `${formatCurrency(-(variance ?? 0))} short of expected.`}
            </p>
          ))}
      </div>

      <RippleButton
        type="button"
        onClick={submitCloseDay}
        disabled={!hasCount || reconciliationBusy}
        className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-90 transition-opacity"
      >
        {reconciliationBusy ? "Saving…" : "Save close day"}
      </RippleButton>
      {reconciliationMessage && <p className="text-sm text-on-surface-muted">{reconciliationMessage}</p>}
      <RippleButton type="button" onClick={shareOnWhatsApp} className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border px-5 text-sm text-on-surface">Share on WhatsApp</RippleButton>
      {history.length > 0 && <section className="flex flex-col gap-2"><h2 className="font-semibold text-on-surface">Recent reconciliations</h2>{history.slice(0, 5).map((record) => <div key={record.id} className="flex justify-between rounded-[var(--radius-card)] border border-border px-4 py-3 text-sm"><span>{record.business_date}</span><span>{formatCurrency(record.actual_cash)} · {formatCurrency(record.discrepancy)}</span></div>)}</section>}
    </div>
  );
}
