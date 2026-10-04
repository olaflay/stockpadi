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
  Package,
  Layers,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ICON_TONE_CLASSES } from "@/components/ui/icon-tone";
import { RippleLink } from "@/components/ui/Ripple";
import { PerformancePill } from "@/components/ui/PerformancePill";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PeriodFilter } from "@/components/ui/PeriodFilter";
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
  stockCostValue = 0,
  stockRetailValue = 0,
  stockByProduct,
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
  stockCostValue?: number;
  stockRetailValue?: number;
  stockByProduct?: Map<string, number>;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "sales" | "inventory">("overview");
  const [showProfitBreakdown, setShowProfitBreakdown] = useState(false);
  const [showCashFlowBreakdown, setShowCashFlowBreakdown] = useState(false);
  const [selectedDayTab, setSelectedDayTab] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Macro metrics
  const totalRevenue = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalExpenses = periodExpensesTotal;
  const totalRestocks = periodPurchasesTotal;
  const totalCogs = Math.max(0, totalRevenue - periodGrossProfit);
  const averageSaleValue = periodSales.length > 0 ? Math.round(totalRevenue / periodSales.length) : 0;

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

  // Credit sales ("Money outside")
  const totalCreditSales = periodSales.reduce((sum, s) => {
    if (s.voidedAt) return sum;
    return (
      sum +
      (s.payments ?? [])
        .filter((p) => p.method === "credit")
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
    <div className="flex flex-col gap-5">
      {/* 1. Header Toolbar: Flat PeriodFilter & Text-Only SegmentedControl */}
      <div className="flex flex-col gap-2.5">
        <PeriodFilter
          options={DROPDOWN_PERIODS}
          selected={period}
          onChange={(newVal) => {
            onSelectPeriod(newVal as Period);
            setSelectedDayTab(null);
          }}
          enableCustomRange={true}
          customRange={customRange}
          onCustomRangeChange={onSelectCustomRange}
          size="compact"
          ariaLabel="Filter report period"
        />

        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "sales", label: "Daily Sales" },
            { value: "inventory", label: "Stock & Shelves" },
          ]}
          selected={activeTab}
          onChange={(val) => setActiveTab(val as "overview" | "sales" | "inventory")}
          size="default"
          ariaLabel="Report views"
        />
      </div>

      {/* ==================== TAB 1: OVERVIEW ==================== */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-4 animate-step-in">
          {/* Hero Revenue Card */}
          <section className="min-w-0 rounded-3xl bg-surface-container p-5 border border-border/20 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
                <span>Total Sales ({PERIOD_LABELS[period]?.toLowerCase()})</span>
                <InfoTooltip text="Total gross revenue recorded across all branches during this period." />
              </span>
              <PerformancePill
                tone={periodSales.length > 0 ? "success" : "neutral"}
                icon={TrendingUp}
                label={periodSales.length > 0 ? "Recorded" : "No Sales"}
              />
            </div>
            <p className="mt-2 truncate text-3xl font-number font-bold tabular-nums text-on-surface">
              {formatCurrency(totalRevenue)}
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-2.5 text-xs text-on-surface-muted">
              <span>
                {periodSales.length} {periodSales.length === 1 ? "sale" : "sales"} recorded
              </span>
              <span>Avg: {formatCurrency(averageSaleValue)} / sale</span>
            </div>
          </section>

          {/* 7-Day Performance Bar Chart — Secondary section */}
          {dayOfWeekStats.length > 0 && periodSales.length > 0 && (
            <section className="rounded-2xl bg-surface-container-low p-4 border border-border/20">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 size={16} className="text-brand-accent" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
                    <span>Weekly Sales Flow</span>
                    <InfoTooltip text="Daily comparison of sales revenue. Tap any day column to jump to that day's receipts." />
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
                        setSelectedDayTab(stat.day);
                        setActiveTab("sales");
                      }}
                      className="flex flex-col items-center gap-1.5 min-w-0 rounded-xl p-1 hover:bg-surface-container-high transition-colors"
                      title={`Tap to see ${stat.day} sales`}
                    >
                      <div className="w-full flex items-end justify-center h-20 bg-surface-container-low rounded-xl p-1">
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-lg transition-all duration-300 ${
                            isPeak
                              ? "bg-brand-accent shadow-sm"
                              : stat.total > 0
                                ? "bg-brand-container"
                                : "bg-surface-container"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-semibold ${
                          isPeak ? "text-brand-accent font-bold" : "text-on-surface-muted"
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
            </section>
          )}

          {/* Clean Profit (Compressible Card) */}
          <div className="rounded-3xl bg-surface-container border border-border/20 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowProfitBreakdown((v) => !v)}
              className="w-full p-5 text-left transition-colors hover:bg-surface-container-high flex flex-col gap-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
                    <span>Clean Profit</span>
                    <InfoTooltip text="Sales revenue minus product cost (what you paid) and shop operational expenses." />
                  </p>
                  <p className="text-[11px] text-on-surface-muted">
                    Sales minus product cost and shop expenses
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PerformancePill
                    tone={periodNetProfit >= 0 ? "success" : "danger"}
                    icon={periodNetProfit >= 0 ? TrendingUp : TrendingDown}
                    label={periodNetProfit >= 0 ? "Profitable" : "Deficit"}
                  />
                  {showProfitBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              <p
                className={`mt-1 truncate text-2xl sm:text-3xl font-number font-bold tabular-nums ${
                  periodNetProfit >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatCurrency(periodNetProfit)}
              </p>
            </button>

            {showProfitBreakdown && (
              <div className="border-t border-border/30 bg-surface-container-low px-5 py-4 space-y-2.5 animate-step-in text-xs">
                <div className="flex justify-between">
                  <span className="text-on-surface-muted">Sales Revenue</span>
                  <span className="font-number tabular-nums font-semibold text-on-surface">
                    {formatCurrency(totalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-muted">Product Cost (what you paid)</span>
                  <span className="font-number tabular-nums text-danger font-semibold">
                    -{formatCurrency(totalCogs)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-muted">Shop Expenses</span>
                  <span className="font-number tabular-nums text-danger font-semibold">
                    -{formatCurrency(totalExpenses)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border/20 font-bold">
                  <span className="text-on-surface">Clean Profit</span>
                  <span
                    className={`font-number tabular-nums ${
                      periodNetProfit >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatCurrency(periodNetProfit)}
                  </span>
                </div>

                <div className="pt-2">
                  <RippleLink
                    href="/expenses"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:underline"
                  >
                    <span>Manage shop expenses</span>
                    <ArrowRight size={13} />
                  </RippleLink>
                </div>
              </div>
            )}
          </div>

          {/* Money in Hand / Cash Flow (Compressible Card) */}
          <div className="rounded-3xl bg-surface-container border border-border/20 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCashFlowBreakdown((v) => !v)}
              className="w-full p-5 text-left transition-colors hover:bg-surface-container-high flex flex-col gap-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
                    <span>Money in Hand (Cash Flow)</span>
                    <InfoTooltip text="Actual physical cash and transfers collected in your till minus money paid out for restocks and expenses." />
                  </p>
                  <p className="text-[11px] text-on-surface-muted">
                    Real cash collected minus shop cash spent
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PerformancePill
                    tone={periodNetCashFlow >= 0 ? "success" : "danger"}
                    icon={periodNetCashFlow >= 0 ? TrendingUp : TrendingDown}
                    label={periodNetCashFlow >= 0 ? "Cash Positive" : "Deficit"}
                  />
                  {showCashFlowBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>
              <p
                className={`mt-1 truncate text-2xl sm:text-3xl font-number font-bold tabular-nums ${
                  periodNetCashFlow >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {formatCurrency(periodNetCashFlow)}
              </p>
            </button>

            {showCashFlowBreakdown && (
              <div className="border-t border-border/30 bg-surface-container-low px-5 py-4 space-y-2.5 animate-step-in text-xs">
                <div className="flex justify-between">
                  <span className="text-on-surface-muted">Cash received (sales)</span>
                  <span className="font-number tabular-nums font-semibold text-on-surface">
                    {formatCurrency(cashReceivedFromSales)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-muted">Shop expenses paid</span>
                  <span className="font-number tabular-nums text-danger font-semibold">
                    -{formatCurrency(totalExpenses)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-muted">Restock deliveries paid</span>
                  <span className="font-number tabular-nums text-danger font-semibold">
                    -{formatCurrency(totalRestocks)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-border/20 font-bold">
                  <span className="text-on-surface">Net cash in hand</span>
                  <span
                    className={`font-number tabular-nums ${
                      periodNetCashFlow >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatCurrency(periodNetCashFlow)}
                  </span>
                </div>

                <div className="pt-2">
                  <RippleLink
                    href="/purchases"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:underline"
                  >
                    <span>View restocks & supplier deliveries</span>
                    <ArrowRight size={13} />
                  </RippleLink>
                </div>
              </div>
            )}
          </div>

          {/* Quick Outflow Shortcuts — flat compact cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <RippleLink
              href="/expenses"
              className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-3 border border-border/20 hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface">Shop Expenses</span>
                <Wallet size={15} className="text-warning" />
              </div>
              <p className="font-number text-base font-bold text-on-surface tabular-nums">
                {formatCurrency(periodExpensesTotal)}
              </p>
              <span className="text-[10px] text-on-surface-muted">
                {periodExpenses.length} entries recorded →
              </span>
            </RippleLink>

            <RippleLink
              href="/purchases"
              className="flex flex-col gap-1.5 rounded-xl bg-surface-container-low p-3 border border-border/20 hover:bg-surface-container transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-on-surface">Restocks</span>
                <Truck size={15} className="text-success" />
              </div>
              <p className="font-number text-base font-bold text-on-surface tabular-nums">
                {formatCurrency(periodPurchasesTotal)}
              </p>
              <span className="text-[10px] text-on-surface-muted">
                {periodPurchases.length} deliveries received →
              </span>
            </RippleLink>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: DAILY SALES & RECEIPTS ==================== */}
      {activeTab === "sales" && (
        <div className="flex flex-col gap-4 animate-step-in">
          {/* Quick Cash vs Debt Snapshot — flat inline section */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-container-low p-3 border border-border/20">
            <div>
              <p className="text-[11px] text-on-surface-muted">Cash in Hand</p>
              <p className="font-number text-base font-bold text-success tabular-nums">
                {formatCurrency(cashReceivedFromSales)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-on-surface-muted">Money Outside (Credit)</p>
              <p className="font-number text-base font-bold text-warning tabular-nums">
                {formatCurrency(totalCreditSales)}
              </p>
            </div>
          </div>

          {selectedDayTab && (
            <div className="flex items-center justify-between rounded-xl bg-brand-container/40 px-3 py-2 text-xs">
              <span className="font-semibold text-brand-accent">
                Filtering by: {selectedDayTab}
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayTab(null)}
                className="font-bold text-brand-accent hover:underline"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* Grouped Daily Summaries */}
          {filteredDailySummaries.length === 0 ? (
            <div className="rounded-3xl bg-surface-container p-8 text-center text-xs text-on-surface-muted">
              No sales recorded for this period.
            </div>
          ) : (
            filteredDailySummaries.map((day) => {
              const isExpanded = expandedDays.has(day.dateIso);
              const isProfitPositive = day.netProfit >= 0;

              return (
                <div
                  key={day.dateIso}
                  className="rounded-3xl bg-surface-container border border-border/30 overflow-hidden shadow-xs"
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-brand-accent" />
                        <h4 className="text-sm font-bold text-on-surface">{day.dayName}</h4>
                      </div>
                      <PerformancePill
                        tone={isProfitPositive ? "success" : "danger"}
                        icon={isProfitPositive ? TrendingUp : TrendingDown}
                        label={isProfitPositive ? "Profit" : "Deficit"}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-container-high/60 p-3 text-xs">
                      <div>
                        <span className="text-[10px] text-on-surface-muted">Sales Recorded</span>
                        <p className="font-number font-bold text-on-surface text-sm tabular-nums">
                          {formatCurrency(day.totalSales)}
                        </p>
                        <span className="text-[10px] text-on-surface-muted">
                          {day.saleCount} {day.saleCount === 1 ? "sale" : "sales"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-on-surface-muted">Clean Profit</span>
                        <p
                          className={`font-number font-bold text-sm tabular-nums ${
                            isProfitPositive ? "text-success" : "text-danger"
                          }`}
                        >
                          {formatCurrency(day.netProfit)}
                        </p>
                        <span className="text-[10px] text-on-surface-muted">
                          Expenses: -{formatCurrency(day.expensesTotal)}
                        </span>
                      </div>
                    </div>

                    {day.sales.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleDayExpanded(day.dateIso)}
                        className="mt-3 flex w-full items-center justify-between rounded-xl bg-surface-container-high/40 px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                        aria-expanded={isExpanded}
                      >
                        <span className="flex items-center gap-1.5">
                          <Receipt size={14} className="text-brand-accent" />
                          {isExpanded ? "Hide receipts" : `View ${day.sales.length} receipts`}
                        </span>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded Individual Sales Receipts */}
                  {isExpanded && day.sales.length > 0 && (
                    <div className="border-t border-border/30 bg-surface-container-low px-4 py-3 divide-y divide-border/20">
                      {day.sales.map((sale) => {
                        const saleTime = new Date(
                          sale.createdAtLocal || sale.createdAt
                        ).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
                                <span className="text-xs font-semibold text-on-surface">
                                  {saleTime}
                                </span>
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
        </div>
      )}

      {/* ==================== TAB 3: STOCK & SHELVES ==================== */}
      {activeTab === "inventory" && (
        <div className="flex flex-col gap-4 animate-step-in">
          {/* Money on Shelves (Store Valuation Card) */}
          <section className="rounded-2xl bg-surface-container p-4 border border-border/20 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
                <span>Money on Shelves (Stock Worth)</span>
                <InfoTooltip text="Selling Value is what you expect to make when sold; Cost Value is what you spent buying the items from suppliers." />
              </h3>
              <Package size={16} className="text-brand-accent" />
            </div>
            <p className="text-[11px] text-on-surface-muted mb-3">
              Total value of all items currently sitting in your shop
            </p>

            <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-surface-container-high/60 p-3 mb-3">
              <div>
                <span className="text-[10px] text-on-surface-muted font-medium">
                  Selling Value (Expected)
                </span>
                <p className="font-number text-lg font-bold text-on-surface tabular-nums mt-0.5">
                  {formatCurrency(stockRetailValue)}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-on-surface-muted font-medium">
                  Cost Value (What you paid)
                </span>
                <p className="font-number text-lg font-bold text-on-surface-muted tabular-nums mt-0.5">
                  {formatCurrency(stockCostValue)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-on-surface-muted">Potential Gross Margin:</span>
              <span className="font-number font-bold text-success tabular-nums">
                +{formatCurrency(Math.max(0, stockRetailValue - stockCostValue))}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-border/20">
              <RippleLink
                href="/products"
                className="flex items-center justify-between text-xs font-semibold text-brand-accent hover:underline"
              >
                <span>View full product catalog</span>
                <ArrowRight size={14} />
              </RippleLink>
            </div>
          </section>

          {/* Running Low Warnings — secondary section */}
          <section className="rounded-2xl bg-surface-container-low p-4 border border-border/20">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
                <span>Running Low ({lowStockProducts.length})</span>
                <InfoTooltip text="Products whose on-shelf count has dropped to or below their re-order alert threshold." />
              </h3>
              {lowStockProducts.length > 0 && (
                <RippleLink
                  href="/purchases"
                  className="text-[11px] font-semibold text-brand-accent hover:underline flex items-center gap-1"
                >
                  <span>Restock</span>
                  <ArrowRight size={12} />
                </RippleLink>
              )}
            </div>

            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-on-surface-muted py-2">
                All product stock levels are healthy right now.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 mt-2">
                {lowStockProducts.slice(0, 8).map((product) => {
                  const qty = stockByProduct?.get(product.id) ?? 0;
                  return (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-2 rounded-2xl bg-surface-container-high/50 px-3.5 py-2.5 text-xs border border-border/10"
                    >
                      <span className="font-medium text-on-surface truncate min-w-0">
                        {product.name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-number font-bold text-danger tabular-nums">
                          {qty} left
                        </span>
                        <RippleLink
                          href="/purchases"
                          className="rounded-lg bg-brand-container px-2 py-1 text-[10px] font-bold text-on-brand-container hover:opacity-90"
                        >
                          Restock
                        </RippleLink>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Fast-Moving Goods (Best Sellers) — secondary section */}
          <section className="rounded-2xl bg-surface-container-low p-4 border border-border/20">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-on-surface-muted inline-flex items-center gap-1.5">
              <span>Fast-Moving Goods (Top Sellers)</span>
              <InfoTooltip text="Top items ranked by the total number of units sold during this time period." />
            </h3>
            {bestSellers.length === 0 ? (
              <p className="text-xs text-on-surface-muted py-2">
                No product sales recorded yet for this period.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bestSellers.map(({ product, quantity }, idx) => (
                  <li
                    key={product?.id ?? quantity}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-high/50 px-3.5 py-2.5 border border-border/10"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <PerformancePill
                        tone={idx === 0 ? "brand" : "neutral"}
                        icon={idx === 0 ? Sparkles : undefined}
                        label={idx === 0 ? "Top Seller" : `#${idx + 1}`}
                      />
                      <span className="truncate text-xs font-medium text-on-surface">
                        {product?.name ?? "Unknown item"}
                      </span>
                    </div>
                    <span className="shrink-0 font-number text-xs font-semibold tabular-nums text-on-surface-muted">
                      {quantity} sold
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 pt-3 border-t border-border/20">
              <RippleLink
                href="/products"
                className="flex items-center justify-between text-xs font-semibold text-brand-accent hover:underline"
              >
                <span>Manage all inventory & items</span>
                <ArrowRight size={14} />
              </RippleLink>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
