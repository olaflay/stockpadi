"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Receipt, Plus, BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { FAB } from "@/components/ui/FAB";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import type { PaymentMethod } from "@/types/sale";
import { tenantArray } from "@/lib/local-tenant";
import type { Sale } from "@/types/sale";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank Transfer",
  pos_terminal: "POS",
  credit: "Credit (Owing)",
};

/**
 * Every completed sale used to be unreachable the moment its toast
 * disappeared — no route showed it again. This is the fix: a tappable
 * history leading to a full detail view. See finding 3.1/#4 in
 * docs/RESEARCH-AND-PLAN.md.
 */
export default function SalesPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [range, setRange] = useState<"all" | "today" | "7days">("all");

  const result = useLiveQuery(async () => {
    try {
      const sales = await tenantArray<Sale>(db.sales);
      sales.sort((a, b) => b.createdAtLocal.localeCompare(a.createdAtLocal));
      return { sales, error: null as string | null };
    } catch (err) {
      return { sales: [], error: err instanceof Error ? err.message : "Could not load sales." };
    }
  }, []);

  // Cashiers only ever see their own sales per the PRD §14 permission
  // matrix ("View sales: Own only"); everyone else with sales visibility
  // sees the branch's full history.
  const visibleSales =
    result?.sales.filter((sale) => {
      if (user.accountType === "WORKER") {
        if (sale.createdByUserId !== user.id) return false;
      }
      if (range === "all") return true;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (range === "7days") start.setDate(start.getDate() - 6);
      return sale.createdAtLocal >= start.toISOString();
    }) ?? [];

  const [visibleLimit, setVisibleLimit] = useState(25);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleLimit < visibleSales.length) {
          setVisibleLimit((prev) => prev + 25);
        }
      },
      { threshold: 0.1 }
    );

    const el = loadMoreRef.current;
    if (el) observer.observe(el);

    return () => {
      if (el) observer.unobserve(el);
    };
  }, [visibleLimit, visibleSales.length]);

  const reportsAction = hasCapability(user, "VIEW_REPORTS") ? (
    <Link
      href="/reports"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-accent-active bg-brand-accent/10 hover:bg-brand-accent/20 rounded-full transition-colors"
    >
      <BarChart3 size={15} />
      <span>Reports</span>
    </Link>
  ) : undefined;

  if (!hasCapability(user, "VIEW_OWN_SALES")) {
    return (
      <div>
        <ScreenHeader title="Sales history" hideBack={true} />
        <PermissionDenied requiredCapabilities={["VIEW_OWN_SALES"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Sales history" hideBack={true} action={reportsAction} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Sales history" hideBack={true} action={reportsAction} />
        <ErrorState message="Couldn't load sales history." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (visibleSales.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Sales history" hideBack={true} action={reportsAction} />
        <EmptyState
          icon={Receipt}
          title={range === "all" ? "No sales yet" : "No sales in this period"}
          description="Completed sales show up here. Tap any one to see its full receipt."
          action={
            hasCapability(user, "POS_SELL")
              ? { label: "Make a sale", onClick: () => router.push("/pos") }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Sales history" hideBack={true} action={reportsAction} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-on-surface-muted">{visibleSales.length} recorded sale{visibleSales.length === 1 ? "" : "s"}</p>
        <label className="flex items-center gap-2 text-xs font-semibold text-on-surface-muted">
          Period
          <select
            aria-label="Sales history period"
            value={range}
            onChange={(event) => { setRange(event.target.value as "all" | "today" | "7days"); setVisibleLimit(25); }}
            className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-surface-container px-2.5 text-xs font-semibold text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20"
          >
            <option value="all">All time</option>
            <option value="7days">Last 7 days</option>
            <option value="today">Today</option>
          </select>
        </label>
      </div>
      <div>
        <ul className="flex flex-col gap-2">
          {visibleSales.slice(0, visibleLimit).map((sale) => {
            const methodSummary = sale.payments.length === 1
              ? PAYMENT_LABELS[sale.payments[0].method]
              : `${sale.payments.length} methods`;
            const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
            return (
              <li key={sale.id}>
                <RippleLink
                  href={`/sales/${sale.id}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 hover:bg-surface-container-high active:scale-[0.99] transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-number text-[length:var(--font-size-body-lg)] font-medium tabular-nums text-on-surface">
                      {formatCurrency(sale.total)}
                      {sale.voidedAt && (
                        <span className="ml-2 text-[length:var(--font-size-caption)] font-normal text-danger">
                          Cancelled
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {itemCount} {itemCount === 1 ? "item" : "items"} · {methodSummary} ·{" "}
                      {new Date(sale.createdAtLocal).toLocaleTimeString("en-NG", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </RippleLink>
              </li>
            );
          })}
        </ul>
        {visibleSales.length > visibleLimit && (
          <div ref={loadMoreRef} className="py-4 text-center text-sm text-on-surface-muted">
            Loading more...
          </div>
        )}
      </div>
      {hasCapability(user, "POS_SELL") && (
        <FAB href="/pos" label="New sale">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
