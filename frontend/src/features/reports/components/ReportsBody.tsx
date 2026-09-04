"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Truck, TrendingUp, TrendingDown, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ICON_TONE_CLASSES } from "@/components/ui/icon-tone";
import { RippleLink } from "@/components/ui/Ripple";
import { PerformancePill } from "@/components/ui/PerformancePill";
import { formatCurrency } from "@/lib/format";
import { PERIOD_LABELS, type Period } from "@/features/reports/use-reports-data";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";

export function ReportsBody({
  period,
  onSelectPeriod,
  periodSales,
  periodExpenses,
  periodExpensesTotal,
  periodPurchases,
  periodPurchasesTotal,
  bestSellers,
  lowStockProducts,
  periodNetProfit,
  periodNetCashFlow,
}: {
  period: Period;
  onSelectPeriod: (period: Period) => void;
  periodSales: Sale[];
  periodExpenses: Expense[];
  periodExpensesTotal: number;
  periodPurchases: Purchase[];
  periodPurchasesTotal: number;
  bestSellers: { product: Product | undefined; quantity: number }[];
  lowStockProducts: Product[];
  periodGrossProfit: number;
  periodNetProfit: number;
  periodNetCashFlow: number;
}) {
  const router = useRouter();
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false);
  const [showCashFlowBreakdown, setShowCashFlowBreakdown] = useState(false);

  // Compute drill-down values
  const totalRevenue = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = periodExpensesTotal;
  const totalRestocks = periodPurchasesTotal;
  // COGS estimate: sum of (item.quantity * item.unitPrice) for all sale items
  const totalCogs = periodSales.reduce((sum, s) => sum + s.items.reduce((itemSum, item) => itemSum + item.quantity * item.unitPrice, 0), 0);
  const computedNetProfit = totalRevenue - totalCogs - totalExpenses;
  const computedNetCashFlow = totalRevenue - totalExpenses - totalRestocks;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => onSelectPeriod(key)}
            className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] px-3 text-[length:var(--font-size-body)]"
            style={{
              background: period === key ? "var(--color-brand-accent)" : "var(--color-surface-container)",
              color: period === key ? "var(--color-brand-accent-contrast)" : "var(--color-on-surface)",
            }}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      <section className="min-w-0 rounded-[var(--radius-focus-block)] bg-surface-container p-5">
        <RippleLink href="/sales" className="block w-full text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[length:var(--font-size-label)] text-on-surface-muted">
              Sales, {PERIOD_LABELS[period].toLowerCase()}
            </p>
            <PerformancePill
              tone={periodSales.length > 0 ? "success" : "neutral"}
              icon={TrendingUp}
              label={periodSales.length > 0 ? "Sales Recorded" : "No Activity"}
            />
          </div>
          <p className="mt-2 truncate text-[length:var(--font-size-display)] font-number font-semibold tabular-nums text-on-surface">
            {formatCurrency(periodSales.reduce((sum, s) => sum + s.total, 0))}
          </p>
          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            {periodSales.length} {periodSales.length === 1 ? "sale" : "sales"}
          </p>
        </RippleLink>
        {period === "today" && (
          <button
            type="button"
            onClick={() => router.push("/close-day")}
            className="mt-4 w-full min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent text-brand-accent-contrast font-medium text-[length:var(--font-size-body)] hover:opacity-95 transition-opacity"
          >
            Close day (guided)
          </button>
        )}
      </section>

      <div className="flex flex-col gap-4">
        {/* Net Profit Card — expandable drill-down */}
        <button
          type="button"
          onClick={() => setShowProfitBreakdown((v) => !v)}
          className="min-w-0 rounded-[var(--radius-focus-block)] bg-surface-container p-5 text-left transition-colors hover:bg-surface-container-high"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[length:var(--font-size-label)] text-on-surface-muted">
              Est. net profit
            </p>
            <div className="flex items-center gap-2">
              <PerformancePill
                tone={periodNetProfit >= 0 ? "success" : "danger"}
                icon={periodNetProfit >= 0 ? TrendingUp : TrendingDown}
                label={periodNetProfit >= 0 ? "Profit" : "Loss"}
              />
              {showProfitBreakdown ? <ChevronUp size={14} className="text-on-surface-muted" /> : <ChevronDown size={14} className="text-on-surface-muted" />}
            </div>
          </div>
          <p className={`mt-2 truncate text-[length:var(--font-size-display)] font-number font-semibold tabular-nums ${periodNetProfit >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(periodNetProfit)}
          </p>
          {showProfitBreakdown && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 animate-step-in">
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Revenue (sales)</span>
                <span className="font-number tabular-nums text-on-surface">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Cost of goods sold</span>
                <span className="font-number tabular-nums text-danger">-{formatCurrency(totalCogs)}</span>
              </div>
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Expenses</span>
                <span className="font-number tabular-nums text-danger">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-[length:var(--font-size-body)] font-medium">
                <span className="text-on-surface">Net profit</span>
                <span className={`font-number tabular-nums ${computedNetProfit >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(computedNetProfit)}
                </span>
              </div>
            </div>
          )}
        </button>

        {/* Net Cash Flow Card — expandable drill-down */}
        <button
          type="button"
          onClick={() => setShowCashFlowBreakdown((v) => !v)}
          className="min-w-0 rounded-[var(--radius-focus-block)] bg-surface-container p-5 text-left transition-colors hover:bg-surface-container-high"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[length:var(--font-size-label)] text-on-surface-muted">
              Net cash flow
            </p>
            <div className="flex items-center gap-2">
              <PerformancePill
                tone={periodNetCashFlow >= 0 ? "success" : "danger"}
                icon={periodNetCashFlow >= 0 ? TrendingUp : TrendingDown}
                label={periodNetCashFlow >= 0 ? "Positive" : "Deficit"}
              />
              {showCashFlowBreakdown ? <ChevronUp size={14} className="text-on-surface-muted" /> : <ChevronDown size={14} className="text-on-surface-muted" />}
            </div>
          </div>
          <p className={`mt-2 truncate text-[length:var(--font-size-display)] font-number font-semibold tabular-nums ${periodNetCashFlow >= 0 ? "text-success" : "text-danger"}`}>
            {formatCurrency(periodNetCashFlow)}
          </p>
          {showCashFlowBreakdown && (
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 animate-step-in">
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Cash received (sales)</span>
                <span className="font-number tabular-nums text-on-surface">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Expenses paid</span>
                <span className="font-number tabular-nums text-danger">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Restock payments</span>
                <span className="font-number tabular-nums text-danger">-{formatCurrency(totalRestocks)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-[length:var(--font-size-body)] font-medium">
                <span className="text-on-surface">Net cash flow</span>
                <span className={`font-number tabular-nums ${computedNetCashFlow >= 0 ? "text-success" : "text-danger"}`}>
                  {formatCurrency(computedNetCashFlow)}
                </span>
              </div>
            </div>
          )}
        </button>
      </div>

      {period !== "today" && (
        <p className="-mt-2 text-[length:var(--font-size-caption)] text-on-surface-muted leading-tight">
          Profit uses current cost price. Cash flow shows exact money received and spent.
        </p>
      )}

      <RippleLink
        href="/expenses"
        aria-label={`View expenses: ${formatCurrency(periodExpensesTotal)}`}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3 text-left hover:bg-surface-container transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES.warning}`}>
            <Wallet size={18} aria-hidden />
          </div>
          <div>
            <p className="text-[length:var(--font-size-body)] font-medium text-on-surface">Expenses</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              {periodExpenses.length} {periodExpenses.length === 1 ? "entry" : "entries"}, {PERIOD_LABELS[period].toLowerCase()}
            </p>
          </div>
        </div>
        <p className="shrink-0 font-number text-[length:var(--font-size-body-lg)] font-semibold tabular-nums text-on-surface">
          {formatCurrency(periodExpensesTotal)}
        </p>
      </RippleLink>

      <RippleLink
        href="/purchases"
        aria-label={`View restocks: ${formatCurrency(periodPurchasesTotal)}`}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3 text-left hover:bg-surface-container transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_TONE_CLASSES.success}`}>
            <Truck size={18} aria-hidden />
          </div>
          <div>
            <p className="text-[length:var(--font-size-body)] font-medium text-on-surface">Restocks</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              {periodPurchases.length} {periodPurchases.length === 1 ? "delivery" : "deliveries"}, {PERIOD_LABELS[period].toLowerCase()}
            </p>
          </div>
        </div>
        <p className="shrink-0 font-number text-[length:var(--font-size-body-lg)] font-semibold tabular-nums text-on-surface">
          {formatCurrency(periodPurchasesTotal)}
        </p>
      </RippleLink>

      <section>
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
          Fast-Moving Goods
        </h2>
        {bestSellers.length === 0 ? (
          <NoResultsState query={PERIOD_LABELS[period]} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bestSellers.map(({ product, quantity }, idx) => (
              <li
                key={product?.id ?? quantity}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <PerformancePill
                    tone={idx === 0 ? "brand" : "neutral"}
                    icon={idx === 0 ? Sparkles : undefined}
                    label={idx === 0 ? "Top Seller" : `#${idx + 1}`}
                  />
                  <span className="truncate text-[length:var(--font-size-body)] text-on-surface">
                    {product?.name ?? "Unknown product"}
                  </span>
                </div>
                <span className="shrink-0 font-number text-[length:var(--font-size-body)] font-semibold tabular-nums text-on-surface-muted">
                  {quantity} sold
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
          Low stock ({lowStockProducts.length})
        </h2>
        {lowStockProducts.length === 0 ? (
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Nothing is low on stock right now.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lowStockProducts.map((product) => (
              <li key={product.id} className="rounded-[var(--radius-card)] border border-border px-4 py-3">
                {product.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
