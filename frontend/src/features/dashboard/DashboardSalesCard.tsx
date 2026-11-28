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
    <svg aria-hidden="true" focusable="false" viewBox="0 0 300 148" preserveAspectRatio="xMaxYMax meet" className={storefront.storefront}>
      <path className={storefront.backdrop} d="M77 141a93 93 0 0 1 186 0z" />
      <path className={storefront.backdrop} d="M48 117h12v3H48zm13-15h16v3H61zm175-86h28v3h-28zm41 9h16v3h-16z" />
      <path className={storefront.ground} d="M14 139h286v9H14z" />
      <path className={storefront.wall} d="M113 54h160v87H113z" />
      <path className={storefront.trim} d="M113 131h160v10H113zM273 54h20v87h-20z" />
      <path className={storefront.glass} d="M126 83h70v35h-70zm88 0h37v58h-37z" />
      <path className={storefront.highlight} d="m142 83-16 24v-9l10-15zm18 0-24 35h8l24-35zm64 0h7l-17 25v-10z" />
      <path className={storefront.detail} d="M126 116h70v4h-70zm34-33h3v35h-3zm52-3h41v3h-41zm9 28h3v9h-3z" />
      <path className={storefront.stripe} d="m116 34 147 0 20 25H96z" />
      <path className={storefront.awning} d="m139 34 22 0-8 25h-29zm43 0h22l4 25h-27zm43 0h22l17 25h-28z" />
      <path className={storefront.stripe} d="M96 59h28v5a14 14 0 0 1-28 0zm57 0h28v5a14 14 0 0 1-28 0zm55 0h28v5a14 14 0 0 1-28 0zm56 0h19v5c0 8-10 14-19 13z" />
      <path className={storefront.awning} d="M124 59h29v5a14.5 14.5 0 0 1-29 0zm57 0h27v5a13.5 13.5 0 0 1-27 0zm55 0h28v5a14 14 0 0 1-28 0z" />
      <path className={storefront.detail} d="M81 119c-2-14-10-20-21-21 2 10 8 19 21 21zm0 0c1-12 8-21 19-24-1 12-5 19-19 24z" />
      <path className={storefront.stripe} d="M68 119h25l-4 20H72z" />
      <path className={storefront.wall} d="M263 127h37v12h-37z" />
    </svg>
  );
}

export function DashboardSalesCard({ branchId, viewerId, branchIds }: {
  branchId: string | null;
  viewerId: string | null;
  branchIds?: readonly string[];
}) {
  const [selectedDay, setSelectedDay] = useState<string>();
  const [pickerUsedByPointer, setPickerUsedByPointer] = useState(false);
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
    <section aria-labelledby="dashboard-sales-title" className="financial-surfaces relative isolate mb-4 overflow-hidden rounded-3xl bg-brand-container px-4 py-3 text-on-brand-container shadow-elevation-1 sm:px-5">
      <div className="relative flex flex-wrap items-center justify-between gap-1">
        <h2 id="dashboard-sales-title" className="text-lg font-bold tracking-tight">
          {day === today ? (viewerId ? "Your sales today" : "Today's sales") : (viewerId ? "Your sales for the day" : "Sales for the day")}
        </h2>
        <label className={`relative inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-full bg-surface-container px-3 text-sm font-semibold text-on-surface has-[:active]:bg-surface-container-high ${pickerUsedByPointer ? "" : "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-accent"}`}>
          <CalendarDays size={17} aria-hidden />
          <span aria-hidden>{bounds.date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(bounds.date.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) })}</span>
          <input
            aria-label="Sales date"
            type="date"
            value={day}
            max={today}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full"
            onPointerDown={() => setPickerUsedByPointer(true)}
            onBlur={() => setPickerUsedByPointer(false)}
            onClick={(event) => {
              try { event.currentTarget.showPicker?.(); } catch { /* The native input remains usable. */ }
            }}
            onChange={(event) => {
              const value = event.target.value;
              if (value <= today && localDayBounds(value)) setSelectedDay(value === today ? undefined : value);
            }}
          />
        </label>
      </div>
      <div aria-live="polite" aria-busy={!current} className={storefront.summary}>
        <div className={storefront.crop}><StorefrontIllustration /></div>
        <div className={storefront.figures}>
          {!current ? (
            <Skeleton className="mt-2 h-10 w-36 rounded-xl" />
          ) : totals ? (
            <>
              <p className="wrap-anywhere font-number text-4xl font-bold leading-tight tracking-tight tabular-nums">{formatCurrency(totals.total)}</p>
              <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                <li className="inline-flex items-center gap-1 whitespace-nowrap"><Receipt size={14} aria-hidden />{totals.count ? `${totals.count} ${totals.count === 1 ? "sale" : "sales"}` : "0 sales recorded"}</li>
                <li className="inline-flex items-center gap-1.5"><Banknote size={16} aria-hidden />{formatCurrency(totals.cash)} cash</li>
                <li className="inline-flex items-center gap-1.5"><CreditCard size={16} aria-hidden />{formatCurrency(totals.credit)} credit</li>
                {totals.other !== 0 && <li>{formatCurrency(totals.other)} other payments</li>}
              </ul>
            </>
          ) : <p className="text-sm">Couldn&apos;t load sales for this day. Open sales history to try again.</p>}
        </div>
      </div>
      <RippleLink href={`/sales?${filters}`} className="relative flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-2xl bg-brand-accent px-4 py-2 text-sm font-semibold text-brand-accent-contrast">
        <Receipt size={18} className="shrink-0" aria-hidden />
        <span className="flex-1">View sales &amp; receipts</span>
        <ArrowRight size={17} className="shrink-0" aria-hidden />
      </RippleLink>
    </section>
  );
}
