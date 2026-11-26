"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Banknote, CalendarDays, CreditCard, Receipt } from "lucide-react";
import { RippleLink } from "@/components/ui/Ripple";
import { Skeleton } from "@/components/ui/Skeleton";
import { db } from "@/lib/db";
import { localDateKey, localDayBounds } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import { tenantArray } from "@/lib/local-tenant";
import { fromKobo, toKobo } from "@/lib/kobo";
import type { Sale } from "@/types/sale";
import storefront from "./storefront.module.css";

function StorefrontIllustration() {
  return (
    <div aria-hidden="true" className={storefront.storefront}>
      <span className={storefront.ground} />
      <span className={storefront.sign} />
      <span className={storefront.building} />
      <span className={storefront.window} />
      <span className={storefront.door} />
      <span className={storefront.awning}>
        <span /><span /><span /><span /><span /><span /><span />
      </span>
      <span className={storefront.plant} />
    </div>
  );
}

export function DashboardSalesCard({ branchId, viewerId, branchIds }: {
  branchId: string | null;
  viewerId: string | null;
  branchIds?: readonly string[];
}) {
  const [selectedDay, setSelectedDay] = useState<string>();
  const today = localDateKey();
  const day = selectedDay ?? today;
  const bounds = localDayBounds(day)!;
  const branchKey = JSON.stringify(branchIds ?? null);
  const result = useLiveQuery(async () => {
    try {
      const sales = await tenantArray<Sale>(
        db.sales.where("createdAtLocal").between(bounds.start, bounds.end, true, false)
      );
      let total = 0, cash = 0, credit = 0, other = 0, count = 0;
      for (const sale of sales) {
        if (sale.voidedAt || (branchId && sale.branchId !== branchId) ||
            (viewerId && (sale.createdByUserId !== viewerId || !branchIds?.includes(sale.branchId)))) continue;
        count++;
        total += toKobo(sale.total);
        for (const payment of sale.payments) {
          if (payment.method === "cash") cash += toKobo(payment.amount);
          else if (payment.method === "credit") credit += toKobo(payment.amount);
          else other += toKobo(payment.amount);
        }
      }
      return { day, branchId, viewerId, branchKey, totals: {
        count, total: fromKobo(total), cash: fromKobo(cash), credit: fromKobo(credit), other: fromKobo(other),
      } };
    } catch {
      return { day, branchId, viewerId, branchKey, totals: null };
    }
  }, [day, branchId, viewerId, branchKey]);
  const current = result?.day === day && result.branchId === branchId &&
    result.viewerId === viewerId && result.branchKey === branchKey ? result : undefined;
  const totals = current?.totals;
  const filters = new URLSearchParams({ date: day });
  if (branchId) filters.set("branch", branchId);
  if (viewerId) filters.set("own", "1");

  return (
    <section aria-labelledby="dashboard-sales-title" className="mb-4 rounded-3xl border border-brand-accent/15 bg-brand-container p-4 text-on-brand-container shadow-elevation-1 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-sales-title" className="text-lg font-bold tracking-tight">
          {day === today ? (viewerId ? "Your sales today" : "Today's sales") : (viewerId ? "Your sales for the day" : "Sales for the day")}
        </h2>
        <label className="relative inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-full bg-surface/60 px-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-brand-accent">
          <CalendarDays size={17} aria-hidden />
          <span aria-hidden>{bounds.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(bounds.date.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) })}</span>
          <input
            aria-label="Sales date"
            type="date"
            value={day}
            max={today}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full"
            onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => {
              const value = event.target.value;
              if (value <= today && localDayBounds(value)) setSelectedDay(value === today ? undefined : value);
            }}
          />
        </label>
      </div>
      <div aria-live="polite" aria-busy={!current} className="mt-1 min-w-0">
        {!current ? (
          <Skeleton className="mt-2 h-10 w-36 rounded-xl" />
        ) : totals ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 wrap-anywhere font-number text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{formatCurrency(totals.total)}</p>
              <div className={`${storefront.crop} -me-4 sm:-me-5`}>
                <StorefrontIllustration />
              </div>
            </div>
            <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <li className="inline-flex items-center gap-1.5"><Receipt size={16} aria-hidden />{totals.count ? `${totals.count} ${totals.count === 1 ? "sale" : "sales"}` : "No sales recorded"}</li>
              <li className="inline-flex items-center gap-1.5"><Banknote size={16} aria-hidden />{formatCurrency(totals.cash)} cash</li>
              <li className="inline-flex items-center gap-1.5"><CreditCard size={16} aria-hidden />{formatCurrency(totals.credit)} credit</li>
              {totals.other !== 0 && <li>{formatCurrency(totals.other)} other payments</li>}
            </ul>
          </>
        ) : <p className="mt-2 text-sm">Couldn&apos;t load sales for this day. Open sales history to try again.</p>}
      </div>
      <RippleLink href={`/sales?${filters}`} className="mt-4 flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-2xl bg-brand-accent px-4 py-2 text-sm font-semibold text-brand-accent-contrast shadow-elevation-1">
        <Receipt size={18} className="shrink-0" aria-hidden />
        <span className="flex-1">View sales &amp; receipts</span>
        <ArrowRight size={17} className="shrink-0" aria-hidden />
      </RippleLink>
    </section>
  );
}
