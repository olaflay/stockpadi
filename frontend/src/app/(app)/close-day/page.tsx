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
import { getStartOfTodayIso } from "@/lib/date";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { WORKER_EXPERIENCE_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { BalancedIllustration } from "@/components/illustrations";
import { computeGrossProfit, computeNetProfit } from "@/features/reports/compute-profit";
import type { PaymentMethod } from "@/types/sale";
import { serverGet, NetworkUnavailableError, BackendRequestError } from "@/features/operations/server-client";
import { fetchReconciliationHistory, submitReconciliation, type ReconciliationRecord } from "@/features/reconciliation/reconciliation-client";
import { tenantArray } from "@/lib/local-tenant";
import { resolveDefaultBranch } from "@/features/branches/resolve-default-branch";
import type { Expense } from "@/types/expense";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";
import { Banknote, Smartphone, CreditCard, Check, AlertTriangle } from "lucide-react";

const CAN_CLOSE_DAY = WORKER_EXPERIENCE_ACCOUNT_TYPES;

type ServerPayment = { method: PaymentMethod; amount: number };
type ServerSale = {
  id: string;
  client_id?: string;
  branch_id: string;
  customer_id?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
  created_by_user_id: string;
  voided_at?: string | null;
  items?: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    unit_label: string;
    unit_conversion_factor: number;
  }>;
  payments?: ServerPayment[];
};
type ServerProduct = { id: string; name: string; cost_price: number; sell_price: number };
type ServerExpense = { id: string; amount: number; category: string; branch_id: string | null; note: string | null; created_at: string; created_by_user_id: string };
type CloseDayResponse = { sales?: ServerSale[]; products?: ServerProduct[]; expenses?: ServerExpense[] };

export default function CloseDayPage() {
  const user = useCurrentUser();
  const router = useRouter();

  // Multi-channel inputs
  const [countedCashInput, setCountedCashInput] = useState("");
  const [verifiedTransferInput, setVerifiedTransferInput] = useState("");
  const [countedPosInput, setCountedPosInput] = useState("");

  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [reconciliationMessage, setReconciliationMessage] = useState<string | null>(null);
  const [reconciliationOk, setReconciliationOk] = useState(false);
  const [history, setHistory] = useState<ReconciliationRecord[]>([]);

  useEffect(() => {
    fetchReconciliationHistory()
      .then((result) => setHistory(result.records))
      .catch(() => setHistory([]));
  }, []);

  const result = useLiveQuery(async () => {
    try {
      try {
        const remote = await serverGet<CloseDayResponse>("/api/reconciliation/summary");
        const sales: Sale[] = (remote.sales ?? []).map((sale) => ({
          id: sale.id,
          clientId: sale.client_id ?? sale.id,
          branchId: sale.branch_id,
          customerId: sale.customer_id ?? null,
          subtotal: Number(sale.subtotal),
          discount: Number(sale.discount),
          total: Number(sale.total),
          createdAtLocal: sale.created_at,
          createdAt: sale.created_at,
          createdByUserId: sale.created_by_user_id,
          voidedAt: sale.voided_at ?? null,
          items: (sale.items ?? []).map((item) => ({
            productId: item.product_id,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            discount: Number(item.discount),
            unitLabel: item.unit_label,
            conversionFactor: Number(item.unit_conversion_factor),
            movementClientId: "server",
          })),
          payments: (sale.payments ?? []).map((payment) => ({
            method: payment.method,
            amount: Number(payment.amount),
          })),
        }));
        const products: Product[] = (remote.products ?? []).map((product) => ({
          id: product.id,
          name: product.name,
          sku: product.id,
          barcode: null,
          categoryId: null,
          brandId: null,
          unitLabel: "piece",
          altUnitLabel: null,
          altUnitConversionFactor: null,
          altUnitSellPrice: null,
          costPrice: Number(product.cost_price),
          sellPrice: Number(product.sell_price),
          expiryTracking: "off",
          expiryDate: null,
          lowStockThreshold: null,
          version: 1,
          updatedAt: new Date().toISOString(),
        }));
        const expenses: Expense[] = (remote.expenses ?? []).map((expense) => ({
          id: expense.id,
          amount: Number(expense.amount),
          category: expense.category,
          branchId: expense.branch_id,
          note: expense.note,
          createdAtLocal: expense.created_at,
          createdByUserId: expense.created_by_user_id,
        }));
        return { sales, products, expenses, profile: undefined, error: null as string | null };
      } catch (error) {
        if (!(error instanceof NetworkUnavailableError) && typeof navigator !== "undefined" && navigator.onLine) throw error;
      }
      const [sales, products, expenses, profile] = await Promise.all([
        tenantArray<Sale>(db.sales),
        tenantArray<Product>(db.products),
        tenantArray<Expense>(db.expenses),
        db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID),
      ]);
      return {
        sales: user.accountType === "WORKER" ? sales.filter((sale) => sale.createdByUserId === user.id) : sales,
        products: user.accountType === "WORKER" ? [] : products,
        expenses: user.accountType === "WORKER" ? [] : expenses,
        profile,
        error: null as string | null,
      };
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

  const todayIso = getStartOfTodayIso();

  const todaySales = result.sales.filter((sale: Sale) => !sale.voidedAt && sale.createdAtLocal >= todayIso);
  const todaySalesTotal = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const todayExpenses = result.expenses.filter((expense: Expense) => expense.createdAtLocal >= todayIso);
  const todayExpensesTotal = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  const totalByMethod = (method: PaymentMethod) =>
    todaySales.reduce(
      (sum, sale) =>
        sum +
        (sale.payments ?? [])
          .filter((payment) => payment.method === method)
          .reduce((paymentSum, payment) => paymentSum + payment.amount, 0),
      0
    );

  const expectedCashSales = totalByMethod("cash");
  const expectedNetCash = Math.max(expectedCashSales - todayExpensesTotal, 0);
  const expectedTransfer = totalByMethod("transfer");
  const expectedPos = totalByMethod("pos_terminal");
  const creditTotal = totalByMethod("credit");

  const grossProfit = computeGrossProfit(todaySales, result.products);
  const netProfit = computeNetProfit(grossProfit, todayExpenses);
  const whatsappNumber = result.profile?.whatsappNumber;

  // Counts & Variances
  const countedCash = Number(countedCashInput);
  const hasCashCount = countedCashInput.trim() !== "" && !Number.isNaN(countedCash);
  const cashVariance = hasCashCount ? countedCash - expectedNetCash : 0;

  const verifiedTransfer = Number(verifiedTransferInput);
  const hasTransferCount = verifiedTransferInput.trim() !== "" && !Number.isNaN(verifiedTransfer);
  const transferVariance = hasTransferCount ? verifiedTransfer - expectedTransfer : 0;

  const countedPos = Number(countedPosInput);
  const hasPosCount = countedPosInput.trim() !== "" && !Number.isNaN(countedPos);
  const posVariance = hasPosCount ? countedPos - expectedPos : 0;

  const hasAnyCount = hasCashCount || hasTransferCount || hasPosCount;
  const totalNetVariance =
    (hasCashCount ? cashVariance : 0) +
    (hasTransferCount ? transferVariance : 0) +
    (hasPosCount ? posVariance : 0);
  const isFullyBalanced = hasAnyCount && Math.abs(totalNetVariance) < 1.0;

  async function submitCloseDay() {
    if (!hasAnyCount || reconciliationBusy) return;
    const localBranches = await tenantArray<{ id: string }>(db.branches);
    const branchId = resolveDefaultBranch(localBranches, user);

    if (!branchId) {
      setReconciliationMessage("No branch is assigned to this account.");
      return;
    }
    setReconciliationBusy(true);
    setReconciliationMessage(null);
    setReconciliationOk(false);
    try {
      const record = await submitReconciliation({
        branchId,
        actualCash: hasCashCount ? countedCash : expectedNetCash,
        expectedCash: expectedNetCash,
        expectedTransfer,
        expectedPos,
        expectedCredit: creditTotal,
        discrepancy: totalNetVariance,
        note: null,
      });
      setHistory((current) => [record, ...current]);
      setReconciliationMessage("Close day saved.");
      setReconciliationOk(true);
    } catch (error) {
      if (error instanceof BackendRequestError && error.code === "CLOSE_DAY_ALREADY_SUBMITTED") {
        setReconciliationMessage("Today's close-day for this branch is already saved. See recent close days below.");
        fetchReconciliationHistory().then((result) => setHistory(result.records)).catch(() => undefined);
      } else {
        setReconciliationMessage("Could not save close day. Check the backend connection and try again.");
      }
    } finally {
      setReconciliationBusy(false);
    }
  }

  function shareOnWhatsApp() {
    const shareMessage =
      `*Close Day Summary — ${new Date().toLocaleDateString("en-NG")}*\n` +
      `Total Sales: ${formatCurrency(todaySalesTotal)} (${todaySales.length} sales)\n` +
      `------------------------\n` +
      `• Cash in Till: Expected ${formatCurrency(expectedNetCash)}` +
      (hasCashCount ? ` | Counted ${formatCurrency(countedCash)} (${cashVariance >= 0 ? `+${formatCurrency(cashVariance)}` : `-${formatCurrency(-cashVariance)}`})` : "") +
      `\n• Bank Transfer: Expected ${formatCurrency(expectedTransfer)}` +
      (hasTransferCount ? ` | Verified ${formatCurrency(verifiedTransfer)} (${transferVariance >= 0 ? `+${formatCurrency(transferVariance)}` : `-${formatCurrency(-transferVariance)}`})` : "") +
      `\n• POS Card Slip: Expected ${formatCurrency(expectedPos)}` +
      (hasPosCount ? ` | Slip ${formatCurrency(countedPos)} (${posVariance >= 0 ? `+${formatCurrency(posVariance)}` : `-${formatCurrency(-posVariance)}`})` : "") +
      `\n• Customer Credit (Owed): ${formatCurrency(creditTotal)}\n` +
      `• Expenses: ${formatCurrency(todayExpensesTotal)}\n` +
      `------------------------\n` +
      `Est. Net Profit: ${formatCurrency(netProfit)}\n` +
      `Status: ${isFullyBalanced ? "Fully Balanced" : Math.abs(totalNetVariance) > 0 ? `Variance ${totalNetVariance > 0 ? "+" : ""}${formatCurrency(totalNetVariance)} (Discrepancy)` : "Pending Count"}`;

    window.open(buildWhatsAppUrl(whatsappNumber, shareMessage), "_blank");
  }

  return (
    <div className="flex flex-col gap-4 pb-12">
      <ScreenHeader title="Close day" onBack={() => router.push("/reports")} />

      {/* Top Sales & Profit Overview */}
      <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
        <div className="flex justify-between items-center">
          <span className="text-on-surface-muted text-[length:var(--font-size-body)]">Today&apos;s total sales</span>
          <span className="text-[length:var(--font-size-title)] font-bold text-on-surface">{formatCurrency(todaySalesTotal)}</span>
        </div>
        <div className="flex justify-between text-[length:var(--font-size-caption)] text-on-surface-muted">
          <span>Transactions: {todaySales.length}</span>
          <span>Expenses: −{formatCurrency(todayExpensesTotal)}</span>
        </div>
        <hr className="border-border" />
        <div className="flex justify-between items-center">
          <span className="text-[length:var(--font-size-body)] text-on-surface-muted">Estimated net profit</span>
          <span className={`text-[length:var(--font-size-body-lg)] font-bold ${netProfit >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(netProfit)}
          </span>
        </div>
      </div>

      {/* Multi-Channel Balancing Section */}
      <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-on-surface px-1">
        Balance your channels
      </h2>

      {/* 1. Cash in Till */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-brand-accent" />
            <span className="text-[length:var(--font-size-body)] font-semibold text-on-surface">
              Physical Cash in Drawer
            </span>
          </div>
          <span className="text-[length:var(--font-size-caption)] font-medium text-on-surface-muted">
            Expected: {formatCurrency(expectedNetCash)}
          </span>
        </div>

        <div className="flex gap-2 mt-1">
          <input
            type="number"
            aria-label="Physical cash counted in drawer"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={countedCashInput}
            onChange={(e) => setCountedCashInput(e.target.value)}
            placeholder={`e.g. ${expectedNetCash}`}
            className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
          <button
            type="button"
            onClick={() => setCountedCashInput(expectedNetCash.toString())}
            aria-label="Set physical cash matching expected total"
            className="rounded-[var(--radius-control)] border border-brand-accent/30 bg-brand-accent/10 px-3 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:bg-brand-accent/20 transition-colors"
          >
            Matches
          </button>
        </div>

        {hasCashCount && (
          <div className="flex items-center gap-1.5 text-[length:var(--font-size-caption)] font-medium">
            {Math.abs(cashVariance) < 0.5 ? (
              <span className="text-success flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Cash is balanced
              </span>
            ) : (
              <span className={cashVariance > 0 ? "text-warning" : "text-danger"}>
                {cashVariance > 0 ? `+${formatCurrency(cashVariance)} extra cash` : `${formatCurrency(cashVariance)} short`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2. Bank Transfers */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand-accent" />
            <span className="text-[length:var(--font-size-body)] font-semibold text-on-surface">
              Bank Transfers (OPay / PalmPay / Bank)
            </span>
          </div>
          <span className="text-[length:var(--font-size-caption)] font-medium text-on-surface-muted">
            Expected: {formatCurrency(expectedTransfer)}
          </span>
        </div>

        <div className="flex gap-2 mt-1">
          <input
            type="number"
            aria-label="Verified bank transfer alerts total"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={verifiedTransferInput}
            onChange={(e) => setVerifiedTransferInput(e.target.value)}
            placeholder={`e.g. ${expectedTransfer}`}
            className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
          />
          <button
            type="button"
            onClick={() => setVerifiedTransferInput(expectedTransfer.toString())}
            aria-label="Set bank transfers matching expected total"
            className="rounded-[var(--radius-control)] border border-brand-accent/30 bg-brand-accent/10 px-3 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:bg-brand-accent/20 transition-colors"
          >
            Matches
          </button>
        </div>

        {hasTransferCount && (
          <div className="flex items-center gap-1.5 text-[length:var(--font-size-caption)] font-medium">
            {Math.abs(transferVariance) < 0.5 ? (
              <span className="text-success flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Transfers verified
              </span>
            ) : (
              <span className={transferVariance > 0 ? "text-warning" : "text-danger"}>
                {transferVariance > 0 ? `+${formatCurrency(transferVariance)} extra transfer` : `${formatCurrency(transferVariance)} missing alert`}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. POS Card Terminal */}
      {expectedPos > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-brand-accent" />
              <span className="text-[length:var(--font-size-body)] font-semibold text-on-surface">
                POS Terminal Slip Total
              </span>
            </div>
            <span className="text-[length:var(--font-size-caption)] font-medium text-on-surface-muted">
              Expected: {formatCurrency(expectedPos)}
            </span>
          </div>

          <div className="flex gap-2 mt-1">
            <input
              type="number"
              aria-label="Counted POS terminal slip total"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={countedPosInput}
              onChange={(e) => setCountedPosInput(e.target.value)}
              placeholder={`e.g. ${expectedPos}`}
              className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface"
            />
            <button
              type="button"
              onClick={() => setCountedPosInput(expectedPos.toString())}
              aria-label="Set POS card slip matching expected total"
              className="rounded-[var(--radius-control)] border border-brand-accent/30 bg-brand-accent/10 px-3 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:bg-brand-accent/20 transition-colors"
            >
              Matches
            </button>
          </div>

          {hasPosCount && (
            <div className="flex items-center gap-1.5 text-[length:var(--font-size-caption)] font-medium">
              {Math.abs(posVariance) < 0.5 ? (
                <span className="text-success flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> POS slip balanced
                </span>
              ) : (
                <span className={posVariance > 0 ? "text-warning" : "text-danger"}>
                  {posVariance > 0 ? `+${formatCurrency(posVariance)} extra` : `${formatCurrency(posVariance)} short`}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Overall Reconciliation Status Badge */}
      {hasAnyCount && (
        <div
          className={`flex items-center gap-3 rounded-[var(--radius-card)] p-4 border ${
            isFullyBalanced
              ? "bg-brand-accent/10 border-brand-accent/30 text-on-surface"
              : "bg-warning-container border-warning/30 text-on-warning-container"
          }`}
        >
          {isFullyBalanced ? (
            <BalancedIllustration className="h-10 w-10 shrink-0" />
          ) : (
            <AlertTriangle className="h-7 w-7 text-warning shrink-0" />
          )}
          <div>
            <p className="font-bold text-[length:var(--font-size-body)]">
              {isFullyBalanced ? "All channels fully balanced" : "Discrepancy detected"}
            </p>
            <p className="text-[length:var(--font-size-caption)] opacity-90">
              {isFullyBalanced
                ? "Physical cash and bank transfer alerts match the expected ledger totals."
                : `Total net variance is ${totalNetVariance > 0 ? "+" : ""}${formatCurrency(totalNetVariance)} across channels.`}
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-2">
        <RippleButton
          type="button"
          onClick={submitCloseDay}
          disabled={!hasAnyCount || reconciliationBusy}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {reconciliationBusy ? "Saving close day…" : "Save Close Day"}
        </RippleButton>

        {reconciliationMessage && (
          <p className={`text-center text-[length:var(--font-size-caption)] font-medium ${reconciliationOk ? "text-success" : "text-danger"}`}>
            {reconciliationMessage}
          </p>
        )}

        <RippleButton
          type="button"
          onClick={shareOnWhatsApp}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-5 text-[length:var(--font-size-body)] font-semibold text-on-surface hover:bg-surface-container transition-colors"
        >
          Share Summary on WhatsApp
        </RippleButton>
      </div>

      {/* Recent History */}
      {history.length > 0 && (
        <section className="flex flex-col gap-2 mt-4">
          <h3 className="font-bold text-[length:var(--font-size-body)] text-on-surface">Recent close days</h3>
          {history.slice(0, 5).map((record) => (
            <div
              key={record.id}
              className="flex justify-between rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-[length:var(--font-size-body-sm)]"
            >
              <span className="font-medium text-on-surface">{record.business_date}</span>
              <span className="text-on-surface-muted">
                Cash {formatCurrency(record.actual_cash)} · Discrepancy {formatCurrency(record.discrepancy)}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
