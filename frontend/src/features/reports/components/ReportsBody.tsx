"use client";

import { useState } from "react";
import {
  Wallet,
  Truck,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
  BarChart2,
  Receipt,
  ArrowRight,
  Filter,
} from "lucide-react";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ICON_TONE_CLASSES } from "@/components/ui/icon-tone";
import { RippleLink } from "@/components/ui/Ripple";
import { PerformancePill } from "@/components/ui/PerformancePill";
import { formatCurrency } from "@/lib/format";
import { PERIOD_LABELS, type Period, type DayOfWeekStat } from "@/features/reports/use-reports-data";
import { computeGrossProfit } from "@/features/reports/compute-profit";
import type { Sale } from "@/types/sale";
import type { Expense } from "@/types/expense";
import type { Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";

const DROPDOWN_PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: "This week" },
  { value: "yesterday", label: "Yesterday" },
  { value: "all_time", label: "All" },
  { value: "custom", label: "Custom" },
];

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
  products = [],
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
  products?: Product[];
  periodGrossProfit: number;
  periodNetProfit: number;
  periodNetCashFlow: number;
}) {
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false);
  const [showCashFlowBreakdown, setShowCashFlowBreakdown] = useState(false);
  const [selectedDayTab, setSelectedDayTab] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Compute macro values aligned with shared formulas
  const totalRevenue = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = periodExpensesTotal;
  const totalRestocks = periodPurchasesTotal;
  const totalCogs = Math.max(0, totalRevenue - periodGrossProfit);

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

  const maxDayRevenue = Math.max(1, ...dayOfWeekStats.map((d) => d.total));
  const peakDay = dayOfWeekStats.find((d) => d.total > 0 && d.total === maxDayRevenue);

  // Group sales & expenses by date (YYYY-MM-DD)
  const dayMap = new Map<
    string,
    {
      dateIso: string;
      dayName: string;
      dayShort: string;
      sales: Sale[];
      expenses: Expense[];
      purchases: Purchase[];
    }
  >();

  for (const s of periodSales) {
    if (s.voidedAt) continue;
    const iso = (s.createdAtLocal || s.createdAt).slice(0, 10);
    if (!dayMap.has(iso)) {
      const d = new Date(iso);
      const dayName = d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
      const dayShort = d.toLocaleDateString("en-GB", { weekday: "short" });
      dayMap.set(iso, { dateIso: iso, dayName, dayShort, sales: [], expenses: [], purchases: [] });
    }
    dayMap.get(iso)!.sales.push(s);
  }

  for (const e of periodExpenses) {
    const iso = e.createdAtLocal.slice(0, 10);
    if (!dayMap.has(iso)) {
      const d = new Date(iso);
      const dayName = d.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      });
      const dayShort = d.toLocaleDateString("en-GB", { weekday: "short" });
      dayMap.set(iso, { dateIso: iso, dayName, dayShort, sales: [], expenses: [], purchases: [] });
    }
    dayMap.get(iso)!.expenses.push(e);
  }

  for (const p of periodPurchases) {
    const iso = (p.createdAtLocal || p.createdAt).slice(0, 10);
    if (dayMap.has(iso)) {
      dayMap.get(iso)!.purchases.push(p);
    }
  }

  const dailySummaries = Array.from(dayMap.values())
    .sort((a, b) => b.dateIso.localeCompare(a.dateIso))
    .map((entry) => {
      const totalSales = entry.sales.reduce((sum, s) => sum + s.total, 0);
      const expensesTotal = entry.expenses.reduce((sum, e) => sum + e.amount, 0);
      const purchasesTotal = entry.purchases.reduce(
        (sum, p) => sum + (p.items?.reduce((iSum, i) => iSum + i.quantity * i.unitCost, 0) || 0),
        0
      );
      const cashReceived = entry.sales.reduce((sum, s) => {
        const nonCredit = (s.payments ?? [])
          .filter((p) => p.method !== "credit")
          .reduce((pSum, p) => pSum + p.amount, 0);
        return sum + nonCredit;
      }, 0);
      const netCashFlow = cashReceived - expensesTotal - purchasesTotal;
      const grossProfit = computeGrossProfit(entry.sales, products);
      const netProfit = grossProfit - expensesTotal;

      return {
        ...entry,
        totalSales,
        saleCount: entry.sales.length,
        expensesTotal,
        netCashFlow,
        netProfit,
      };
    });

  const filteredDailySummaries = selectedDayTab
    ? dailySummaries.filter((d) => d.dayShort.toLowerCase() === selectedDayTab.toLowerCase())
    : dailySummaries;

  function toggleDayExpanded(dateIso: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateIso)) next.delete(dateIso);
      else next.add(dateIso);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Filter Dropdown Menu */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-3 border border-border/30">
        <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
          <Filter size={16} className="text-brand-accent shrink-0" />
          <span>Report Period:</span>
        </div>

        <div className="relative min-w-[130px]">
          <select
            value={period}
            onChange={(e) => {
              onSelectPeriod(e.target.value as Period);
              setSelectedDayTab(null);
            }}
            aria-label="Filter report period"
            className="w-full appearance-none rounded-xl border border-border bg-surface px-3 py-2 pr-8 text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-accent/20 cursor-pointer"
          >
            {DROPDOWN_PERIODS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-muted"
          />
        </div>
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

      {/* 2. Hero Revenue & Summary Card */}
      <section className="min-w-0 rounded-3xl bg-surface-container p-5 border border-border/20 shadow-xs">
        <RippleLink href="/sales" className="block w-full text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-on-surface-muted">
              Sales, {PERIOD_LABELS[period]?.toLowerCase() || "selected period"}
            </p>
            <PerformancePill
              tone={periodSales.length > 0 ? "success" : "neutral"}
              icon={TrendingUp}
              label={periodSales.length > 0 ? "Sales Recorded" : "No Activity"}
            />
          </div>
          <p className="mt-2 truncate text-3xl font-number font-bold tabular-nums text-on-surface">
            {formatCurrency(totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-on-surface-muted">
            {periodSales.length} {periodSales.length === 1 ? "sale" : "sales"} recorded
          </p>
        </RippleLink>
      </section>

      {/* 3. Interactive Bar Chart: Weekly Sales & Cash Flow Performance */}
      {dayOfWeekStats.length > 0 && periodSales.length > 0 && (
        <section className="rounded-3xl bg-surface-container p-4 sm:p-5 border border-border/20 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-brand-accent" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                Weekly Sales & Cash Flow Performance
              </h3>
            </div>
            {peakDay && (
              <span className="text-[10px] font-semibold text-brand-accent bg-brand-container px-2 py-0.5 rounded-full uppercase tracking-wider">
                Peak: {peakDay.day}
              </span>
            )}
          </div>
          <p className="text-[11px] text-on-surface-muted mb-2">
            Tap any day column to filter and view the full summary card for that day:
          </p>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 items-end pt-2">
            {dayOfWeekStats.map((stat) => {
              const heightPercent =
                maxDayRevenue > 0 && stat.total > 0
                  ? Math.max(14, Math.round((stat.total / maxDayRevenue) * 100))
                  : 8;
              const isSelected = selectedDayTab?.toLowerCase() === stat.day.toLowerCase();
              const isPeak = peakDay?.day === stat.day;

              return (
                <button
                  key={stat.day}
                  type="button"
                  onClick={() => {
                    setSelectedDayTab((prev) =>
                      prev?.toLowerCase() === stat.day.toLowerCase() ? null : stat.day
                    );
                  }}
                  className={`flex flex-col items-center gap-1.5 min-w-0 rounded-xl p-1 transition-all ${
                    isSelected
                      ? "ring-2 ring-brand-accent bg-brand-container/30"
                      : "hover:bg-surface-container-high"
                  }`}
                  aria-pressed={isSelected}
                  title={`Tap to see ${stat.day}'s summary report`}
                >
                  <div className="w-full flex items-end justify-center h-20 bg-surface-container-low rounded-xl p-1">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-lg transition-all duration-300 ${
                        isSelected
                          ? "bg-brand-accent shadow-sm"
                          : isPeak
                            ? "bg-brand-accent/80"
                            : stat.total > 0
                              ? "bg-brand-container"
                              : "bg-surface-container"
                      }`}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-semibold ${
                      isSelected
                        ? "text-brand-accent font-bold"
                        : isPeak
                          ? "text-brand-accent"
                          : "text-on-surface-muted"
                    }`}
                  >
                    {stat.day}
                  </span>
                  <span className="text-[10px] font-number text-on-surface-muted tabular-nums truncate w-full text-center">
                    {stat.count > 0 ? stat.count : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedDayTab && (
            <div className="mt-3 flex items-center justify-between border-t border-border/30 pt-2.5 text-xs">
              <span className="text-on-surface-muted">
                Showing day filter: <strong>{selectedDayTab}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayTab(null)}
                className="text-brand-accent font-semibold hover:underline"
              >
                Clear filter
              </button>
            </div>
          )}
        </section>
      )}

      {/* 4. Daily Performance Summary Cards (Grouped by Day) */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
            Daily Summaries {selectedDayTab ? `(${selectedDayTab})` : ""}
          </h2>
          <span className="text-[11px] text-on-surface-muted">
            {filteredDailySummaries.length}{" "}
            {filteredDailySummaries.length === 1 ? "day recorded" : "days recorded"}
          </span>
        </div>

        {filteredDailySummaries.length === 0 ? (
          <div className="rounded-2xl bg-surface-container p-6 text-center text-xs text-on-surface-muted">
            No sales or cash activity found for the selected period.
          </div>
        ) : (
          filteredDailySummaries.map((day) => {
            const isExpanded = expandedDays.has(day.dateIso);
            const isProfitPositive = day.netProfit >= 0;
            const isCashPositive = day.netCashFlow >= 0;

            return (
              <div
                key={day.dateIso}
                className="flex flex-col rounded-3xl bg-surface-container border border-border/30 overflow-hidden shadow-xs transition-all"
              >
                {/* Master Day Card Header */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-brand-accent" />
                      <h3 className="text-sm font-bold text-on-surface">{day.dayName}</h3>
                    </div>
                    <PerformancePill
                      tone={isProfitPositive ? "success" : "danger"}
                      icon={isProfitPositive ? TrendingUp : TrendingDown}
                      label={isProfitPositive ? "Profitable" : "Deficit"}
                    />
                  </div>

                  {/* 4 Core Arranged Metrics: Sales, Cash Flow, Profits, Expenses */}
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 rounded-2xl bg-surface-container-high/60 p-3.5 border border-border/20">
                    <div>
                      <p className="text-[11px] text-on-surface-muted font-medium">Sales Recorded</p>
                      <p className="text-base font-number font-bold text-on-surface tabular-nums">
                        {formatCurrency(day.totalSales)}
                      </p>
                      <p className="text-[10px] text-on-surface-muted">
                        {day.saleCount} {day.saleCount === 1 ? "sale" : "sales"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] text-on-surface-muted font-medium">Net Cash Flow</p>
                      <p
                        className={`text-base font-number font-bold tabular-nums ${
                          isCashPositive ? "text-success" : "text-danger"
                        }`}
                      >
                        {formatCurrency(day.netCashFlow)}
                      </p>
                      <p className="text-[10px] text-on-surface-muted">Exact cash in/out</p>
                    </div>

                    <div className="border-t border-border/20 pt-2">
                      <p className="text-[11px] text-on-surface-muted font-medium">Est. Net Profit</p>
                      <p
                        className={`text-sm font-number font-semibold tabular-nums ${
                          isProfitPositive ? "text-success" : "text-danger"
                        }`}
                      >
                        {formatCurrency(day.netProfit)}
                      </p>
                    </div>

                    <div className="border-t border-border/20 pt-2">
                      <p className="text-[11px] text-on-surface-muted font-medium">Shop Expenses</p>
                      <p className="text-sm font-number font-semibold text-danger tabular-nums">
                        -{formatCurrency(day.expensesTotal)}
                      </p>
                    </div>
                  </div>

                  {/* Drill-down Toggle Button */}
                  {day.sales.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleDayExpanded(day.dateIso)}
                      className="mt-3 flex w-full items-center justify-between rounded-xl bg-surface-container-high/40 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                      aria-expanded={isExpanded}
                    >
                      <span className="flex items-center gap-1.5">
                        <Receipt size={14} className="text-brand-accent" />
                        {isExpanded ? "Hide individual sales" : `View ${day.sales.length} sales & receipts`}
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  )}
                </div>

                {/* Expanded Individual Sales List */}
                {isExpanded && day.sales.length > 0 && (
                  <div className="border-t border-border/30 bg-surface-container-low px-4 py-3 divide-y divide-border/20">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-muted pb-2">
                      Sales on {day.dayName} (tap to view receipt)
                    </p>
                    {day.sales.map((sale) => {
                      const saleTime = new Date(sale.createdAtLocal || sale.createdAt).toLocaleTimeString(
                        "en-GB",
                        { hour: "2-digit", minute: "2-digit" }
                      );
                      const primaryPayment = sale.payments?.[0]?.method || "cash";
                      const itemCount = sale.items?.reduce((c, i) => c + i.quantity, 0) || 0;

                      return (
                        <RippleLink
                          key={sale.id}
                          href={`/sales/${sale.id}`}
                          className="flex items-center justify-between py-2.5 hover:bg-surface-container transition-colors rounded-xl px-2 -mx-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-on-surface">{saleTime}</span>
                              <span className="rounded-full bg-brand-container px-2 py-0.5 text-[9px] font-semibold text-on-brand-container uppercase">
                                {primaryPayment}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface-muted truncate mt-0.5">
                              {itemCount} {itemCount === 1 ? "item" : "items"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-number font-bold text-on-surface tabular-nums">
                              {formatCurrency(sale.total)}
                            </span>
                            <ArrowRight size={14} className="text-on-surface-muted" />
                          </div>
                        </RippleLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* 5. Period Profit & Cash Flow Deep Dives */}
      <div className="flex flex-col gap-4">
        {/* Net Profit Card */}
        <button
          type="button"
          onClick={() => setShowProfitBreakdown((v) => !v)}
          className="min-w-0 rounded-3xl bg-surface-container p-5 text-left transition-colors hover:bg-surface-container-high border border-border/20 shadow-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
              Period Net Profit
            </p>
            <div className="flex items-center gap-2">
              <PerformancePill
                tone={periodNetProfit >= 0 ? "success" : "danger"}
                icon={periodNetProfit >= 0 ? TrendingUp : TrendingDown}
                label={periodNetProfit >= 0 ? "Profit" : "Loss"}
              />
              {showProfitBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
          <p
            className={`mt-2 truncate text-2xl sm:text-3xl font-number font-bold tabular-nums ${
              periodNetProfit >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatCurrency(periodNetProfit)}
          </p>
          {showProfitBreakdown && (
            <div className="mt-3 space-y-2 rounded-xl bg-surface-container-high/50 p-3 animate-step-in">
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-muted">Revenue (sales)</span>
                <span className="font-number tabular-nums text-on-surface">
                  {formatCurrency(totalRevenue)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-muted">Cost of goods sold (COGS)</span>
                <span className="font-number tabular-nums text-danger">
                  -{formatCurrency(totalCogs)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-muted">Expenses</span>
                <span className="font-number tabular-nums text-danger">
                  -{formatCurrency(totalExpenses)}
                </span>
              </div>
              <div className="flex justify-between pt-1 text-xs font-semibold border-t border-border/30">
                <span className="text-on-surface">Net profit</span>
                <span
                  className={`font-number tabular-nums ${
                    periodNetProfit >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatCurrency(periodNetProfit)}
                </span>
              </div>
            </div>
          )}
        </button>

        {/* Net Cash Flow Card */}
        <button
          type="button"
          onClick={() => setShowCashFlowBreakdown((v) => !v)}
          className="min-w-0 rounded-3xl bg-surface-container p-5 text-left transition-colors hover:bg-surface-container-high border border-border/20 shadow-xs"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
              Period Net Cash Flow
            </p>
            <div className="flex items-center gap-2">
              <PerformancePill
                tone={periodNetCashFlow >= 0 ? "success" : "danger"}
                icon={periodNetCashFlow >= 0 ? TrendingUp : TrendingDown}
                label={periodNetCashFlow >= 0 ? "Positive" : "Deficit"}
              />
              {showCashFlowBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          </div>
          <p
            className={`mt-2 truncate text-2xl sm:text-3xl font-number font-bold tabular-nums ${
              periodNetCashFlow >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatCurrency(periodNetCashFlow)}
          </p>
          {showCashFlowBreakdown && (
            <div className="mt-3 space-y-2 rounded-xl bg-surface-container-high/50 p-3 animate-step-in">
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-muted">Cash received (sales)</span>
                <span className="font-number tabular-nums text-on-surface">
                  {formatCurrency(cashReceivedFromSales)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-muted">Expenses paid</span>
                <span className="font-number tabular-nums text-danger">
                  -{formatCurrency(totalExpenses)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-muted">Restock payments</span>
                <span className="font-number tabular-nums text-danger">
                  -{formatCurrency(totalRestocks)}
                </span>
              </div>
              <div className="flex justify-between pt-1 text-xs font-semibold border-t border-border/30">
                <span className="text-on-surface">Net cash flow</span>
                <span
                  className={`font-number tabular-nums ${
                    periodNetCashFlow >= 0 ? "text-success" : "text-danger"
                  }`}
                >
                  {formatCurrency(periodNetCashFlow)}
                </span>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* 6. Quick Links to Expenses & Restocks */}
      <RippleLink
        href="/expenses"
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3 text-left hover:bg-surface-container-high transition-colors border border-border/20"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONE_CLASSES.warning}`}
          >
            <Wallet size={18} aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface">Expenses</p>
            <p className="text-[10px] text-on-surface-muted">
              {periodExpenses.length} {periodExpenses.length === 1 ? "entry" : "entries"} recorded
            </p>
          </div>
        </div>
        <p className="shrink-0 font-number text-sm font-semibold tabular-nums text-on-surface">
          {formatCurrency(periodExpensesTotal)}
        </p>
      </RippleLink>

      <RippleLink
        href="/purchases"
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3 text-left hover:bg-surface-container-high transition-colors border border-border/20"
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONE_CLASSES.success}`}
          >
            <Truck size={18} aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold text-on-surface">Restocks</p>
            <p className="text-[10px] text-on-surface-muted">
              {periodPurchases.length} {periodPurchases.length === 1 ? "delivery" : "deliveries"}{" "}
              recorded
            </p>
          </div>
        </div>
        <p className="shrink-0 font-number text-sm font-semibold tabular-nums text-on-surface">
          {formatCurrency(periodPurchasesTotal)}
        </p>
      </RippleLink>

      {/* 7. Fast-Moving Goods */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted px-1">
          Fast-Moving Goods
        </h2>
        {bestSellers.length === 0 ? (
          <NoResultsState query={PERIOD_LABELS[period]} />
        ) : (
          <ul className="flex flex-col gap-2">
            {bestSellers.map(({ product, quantity }, idx) => (
              <li
                key={product?.id ?? quantity}
                className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container px-4 py-3 border border-border/20"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <PerformancePill
                    tone={idx === 0 ? "brand" : "neutral"}
                    icon={idx === 0 ? Sparkles : undefined}
                    label={idx === 0 ? "Top Seller" : `#${idx + 1}`}
                  />
                  <span className="truncate text-xs font-medium text-on-surface">
                    {product?.name ?? "Unknown product"}
                  </span>
                </div>
                <span className="shrink-0 font-number text-xs font-semibold tabular-nums text-on-surface-muted">
                  {quantity} sold
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 8. Low Stock Section */}
      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted px-1">
          Low stock ({lowStockProducts.length})
        </h2>
        {lowStockProducts.length === 0 ? (
          <p className="text-xs text-on-surface-muted px-1">Nothing is low on stock right now.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lowStockProducts.map((product) => (
              <li
                key={product.id}
                className="rounded-2xl bg-surface-container px-4 py-3 text-xs text-on-surface border border-border/20"
              >
                {product.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
