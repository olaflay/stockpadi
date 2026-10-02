"use client";

import { useState } from "react";
import { Wallet, Truck, TrendingUp, TrendingDown, Sparkles, ChevronDown, ChevronUp, Calendar, BarChart2 } from "lucide-react";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ICON_TONE_CLASSES } from "@/components/ui/icon-tone";
import { RippleLink } from "@/components/ui/Ripple";
import { PerformancePill } from "@/components/ui/PerformancePill";
import { formatCurrency } from "@/lib/format";
import { PERIOD_LABELS, type Period, type DayOfWeekStat } from "@/features/reports/use-reports-data";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";

export function ReportsBody({
  period,
  onSelectPeriod,
  customRange,
  onSelectCustomRange,
  dayOfWeekStats = [],
  periodSales,
  periodExpenses,
  periodExpensesTotal,
  periodPurchases,
  periodPurchasesTotal,
  bestSellers,
  lowStockProducts,
  periodGrossProfit,
  periodNetProfit,
  periodNetCashFlow,
}: {
  period: Period;
  onSelectPeriod: (period: Period) => void;
  customRange?: { start: string; end: string };
  onSelectCustomRange?: (range: { start: string; end: string } | undefined) => void;
  dayOfWeekStats?: DayOfWeekStat[];
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
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false);
  const [showCashFlowBreakdown, setShowCashFlowBreakdown] = useState(false);

  // Compute drill-down values aligned with the shared formulas
  const totalRevenue = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = periodExpensesTotal;
  const totalRestocks = periodPurchasesTotal;
  // COGS is mathematically totalRevenue - periodGrossProfit, ensuring totalRevenue - totalCogs - totalExpenses === periodNetProfit exactly
  const totalCogs = Math.max(0, totalRevenue - periodGrossProfit);
  const computedNetProfit = periodNetProfit;

  // Real cash received from sales (excluding unpaid credit)
  const cashReceivedFromSales = periodSales.reduce((sum, s) => {
    if (s.voidedAt) return sum;
    return (
      sum +
      (s.payments ?? [])
        .filter((p) => p.method !== "credit")
        .reduce((pSum, p) => pSum + p.amount, 0)
    );
  }, 0);
  const computedNetCashFlow = periodNetCashFlow;

  const maxDayRevenue = Math.max(1, ...dayOfWeekStats.map((d) => d.total));
  const peakDay = dayOfWeekStats.find((d) => d.total > 0 && d.total === maxDayRevenue);

  return (
    <div className="flex flex-col gap-6">
      {/* Scrollable Period Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="Report period">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={period === key}
            onClick={() => onSelectPeriod(key)}
            className={`min-h-[var(--touch-target-min)] shrink-0 rounded-2xl px-4 text-xs font-semibold transition-all ${
              period === key
                ? "bg-brand-accent text-brand-accent-contrast shadow-sm"
                : "bg-surface-container text-on-surface hover:bg-surface-container-high active:scale-95"
            }`}
          >
            {PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Custom Date Range Picker when Custom tab is selected */}
      {period === "custom" && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-container p-4 border border-border/30 animate-step-in">
          <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
            <Calendar size={16} className="text-brand-accent" />
            <span>Select Date Range</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-on-surface-muted font-medium">
              Start date
              <input
                type="date"
                value={customRange?.start ? customRange.start.slice(0, 10) : ""}
                onChange={(e) =>
                  onSelectCustomRange?.({
                    start: e.target.value,
                    end: customRange?.end ?? new Date().toISOString().slice(0, 10),
                  })
                }
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-on-surface"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-on-surface-muted font-medium">
              End date
              <input
                type="date"
                value={customRange?.end ? customRange.end.slice(0, 10) : ""}
                onChange={(e) =>
                  onSelectCustomRange?.({
                    start: customRange?.start ?? new Date().toISOString().slice(0, 10),
                    end: e.target.value,
                  })
                }
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-on-surface"
              />
            </label>
          </div>
        </div>
      )}

      {/* Hero Revenue Card */}
      <section className="min-w-0 rounded-3xl bg-surface-container p-5 border border-border/20 shadow-xs">
        <RippleLink href="/sales" className="block w-full text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-on-surface-muted">
              Sales, {PERIOD_LABELS[period].toLowerCase()}
            </p>
            <PerformancePill
              tone={periodSales.length > 0 ? "success" : "neutral"}
              icon={TrendingUp}
              label={periodSales.length > 0 ? "Sales Recorded" : "No Activity"}
            />
          </div>
          <p className="mt-2 truncate text-3xl font-number font-bold tabular-nums text-on-surface">
            {formatCurrency(periodSales.reduce((sum, s) => sum + s.total, 0))}
          </p>
          <p className="mt-1 text-xs text-on-surface-muted">
            {periodSales.length} {periodSales.length === 1 ? "sale" : "sales"} recorded
          </p>
        </RippleLink>
      </section>

      {/* Day-of-Week Analytics Breakdown */}
      {dayOfWeekStats.length > 0 && periodSales.length > 0 && (
        <section className="rounded-3xl bg-surface-container p-4 sm:p-5 border border-border/20 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-brand-accent" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                Sales by Day of Week
              </h3>
            </div>
            {peakDay && (
              <span className="text-[10px] font-semibold text-brand-accent bg-brand-container px-2 py-0.5 rounded-full uppercase tracking-wider">
                Peak: {peakDay.day}
              </span>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 items-end pt-2">
            {dayOfWeekStats.map((stat) => {
              const heightPercent = maxDayRevenue > 0 && stat.total > 0 ? Math.max(12, Math.round((stat.total / maxDayRevenue) * 100)) : 6;
              const isPeak = peakDay?.day === stat.day;

              return (
                <div key={stat.day} className="flex flex-col items-center gap-1.5 min-w-0">
                  <div className="w-full flex items-end justify-center h-20 bg-surface-container-low rounded-xl p-1">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-lg transition-all duration-300 ${
                        isPeak ? "bg-brand-accent shadow-xs" : stat.total > 0 ? "bg-brand-container" : "bg-transparent"
                      }`}
                      title={`${stat.day}: ${stat.count} sales (${formatCurrency(stat.total)})`}
                    />
                  </div>
                  <span className={`text-[11px] font-semibold ${isPeak ? "text-brand-accent" : "text-on-surface-muted"}`}>
                    {stat.day}
                  </span>
                  <span className="text-[10px] font-number text-on-surface-muted tabular-nums truncate w-full text-center">
                    {stat.count > 0 ? stat.count : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
            <div className="mt-3 space-y-2 rounded-xl bg-surface-container-high/50 p-3 animate-step-in">
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
              <div className="flex justify-between pt-1 text-[length:var(--font-size-body)] font-semibold">
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
            <div className="mt-3 space-y-2 rounded-xl bg-surface-container-high/50 p-3 animate-step-in">
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Cash received (sales)</span>
                <span className="font-number tabular-nums text-on-surface">{formatCurrency(cashReceivedFromSales)}</span>
              </div>
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Expenses paid</span>
                <span className="font-number tabular-nums text-danger">-{formatCurrency(totalExpenses)}</span>
              </div>
              <div className="flex justify-between text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">Restock payments</span>
                <span className="font-number tabular-nums text-danger">-{formatCurrency(totalRestocks)}</span>
              </div>
              <div className="flex justify-between pt-1 text-[length:var(--font-size-body)] font-semibold">
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
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-left hover:bg-surface-container-high transition-colors"
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
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-left hover:bg-surface-container-high transition-colors"
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
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3"
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
              <li key={product.id} className="rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-[length:var(--font-size-body)] text-on-surface">
                {product.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
