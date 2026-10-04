"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Receipt, Plus, BarChart3, ArrowDownLeft, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { FilterDropdownBar, type FilterGroup } from "@/components/ui/FilterDropdownBar";
import { MonthGroupHeader } from "@/components/ui/MonthGroupHeader";
import { TransactionItemRow, type TransactionStatus } from "@/components/ui/TransactionItemRow";
import { FAB } from "@/components/ui/FAB";
import { getPeriodStartIso, formatTransactionTimestamp, getMonthYearKey, formatMonthYear } from "@/lib/date";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import type { PaymentMethod, Sale } from "@/types/sale";
import { tenantArray } from "@/lib/local-tenant";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  transfer: "Transfer",
  pos_terminal: "POS",
  credit: "Credit",
};

type SalesPeriod = "today" | "week" | "month" | "all_time";
type SalesPaymentFilter = "all" | "cash" | "transfer" | "pos_terminal" | "credit";

export default function SalesPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [paymentFilter, setPaymentFilter] = useState<SalesPaymentFilter>("all");

  const result = useLiveQuery(async () => {
    try {
      const startIso = getPeriodStartIso(period);
      const sales = await tenantArray<Sale>(
        db.sales.where("createdAtLocal").aboveOrEqual(startIso).reverse()
      );
      return { sales, error: null as string | null };
    } catch (err) {
      return { sales: [], error: err instanceof Error ? err.message : "Could not load sales." };
    }
  }, [period]);

  // Cashiers only ever see their own sales per PRD §14
  const visibleSales = useMemo(() => {
    return (
      result?.sales.filter((sale) => {
        if (user.accountType === "WORKER" && sale.createdByUserId !== user.id) {
          return false;
        }

        // Payment method filter
        if (paymentFilter !== "all") {
          const hasMethod = sale.payments.some((p) => p.method === paymentFilter);
          if (!hasMethod) return false;
        }

        return true;
      }) ?? []
    );
  }, [result?.sales, user.accountType, user.id, paymentFilter]);

  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleLimit < visibleSales.length) {
          setVisibleLimit((prev) => prev + 50);
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

  // Group sales by Month (YYYY-MM)
  const groupedSales = useMemo(() => {
    const map = new Map<string, Sale[]>();
    for (const sale of visibleSales.slice(0, visibleLimit)) {
      const key = getMonthYearKey(sale.createdAtLocal);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(sale);
    }
    return Array.from(map.entries()).map(([monthKey, sales]) => {
      const inflow = sales.filter((s) => !s.voidedAt).reduce((sum, s) => sum + s.total, 0);
      const outflow = sales.filter((s) => Boolean(s.voidedAt)).reduce((sum, s) => sum + s.total, 0);
      return {
        monthKey,
        monthName: formatMonthYear(monthKey),
        sales,
        inflow,
        outflow,
      };
    });
  }, [visibleSales, visibleLimit]);

  const reportsAction = hasCapability(user, "VIEW_REPORTS") ? (
    <Link
      href="/reports"
      className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-brand-accent-active bg-brand-accent/10 hover:bg-brand-accent/20 rounded-full transition-colors"
    >
      <BarChart3 size={15} />
      <span>Reports</span>
    </Link>
  ) : undefined;

  const filterGroups: FilterGroup[] = [
    {
      id: "period",
      label: "Date Range",
      options: [
        { value: "today", label: "Today" },
        { value: "week", label: "7 Days" },
        { value: "month", label: "30 Days" },
        { value: "all_time", label: "All Time" },
      ],
      selectedValue: period,
      onChange: (val) => setPeriod(val as SalesPeriod),
      renderTriggerLabel: (val) => {
        if (val === "today") return "Today";
        if (val === "week") return "7 Days";
        if (val === "month") return "30 Days";
        return "All Dates";
      },
    },
    {
      id: "payment",
      label: "All Payment Methods",
      options: [
        { value: "all", label: "All Payment Methods" },
        { value: "cash", label: "Cash" },
        { value: "transfer", label: "Bank Transfer" },
        { value: "pos_terminal", label: "POS" },
        { value: "credit", label: "Credit (Owing)" },
      ],
      selectedValue: paymentFilter,
      onChange: (val) => setPaymentFilter(val as SalesPaymentFilter),
    },
  ];

  if (!hasCapability(user, "VIEW_OWN_SALES")) {
    return (
      <div>
        <ScreenHeader title="Sales history" backHref="/more" />
        <PermissionDenied requiredCapabilities={["VIEW_OWN_SALES"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Sales history" backHref="/more" action={reportsAction} />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Sales history" backHref="/more" action={reportsAction} />
        <ErrorState message="Couldn't load sales." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-12">
      <ScreenHeader title="Sales history" backHref="/more" action={reportsAction} />

      {/* Top Filter Dropdown Bar with Expanding Pill Tray */}
      <FilterDropdownBar filters={filterGroups} ariaLabel="Filter sales by date and payment method" />

      {visibleSales.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={Receipt}
            title="No sales found"
            description="No sales recorded for this period."
            action={
              hasCapability(user, "POS_SELL")
                ? { label: "Make a sale", onClick: () => router.push("/pos") }
                : undefined
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groupedSales.map((group) => (
            <section key={group.monthKey} className="flex flex-col gap-2">
              {/* Month Group Header with In/Out and Analysis Action */}
              <MonthGroupHeader
                title={group.monthName}
                inflow={group.inflow}
                outflow={group.outflow > 0 ? group.outflow : undefined}
                analysisHref="/reports"
              />

              {/* Transactions List */}
              <ul className="flex flex-col gap-2">
                {group.sales.map((sale) => {
                  const isVoided = Boolean(sale.voidedAt);
                  const isCredit = sale.payments.some((p) => p.method === "credit");
                  const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
                  const methodSummary =
                    sale.payments.length === 1
                      ? PAYMENT_LABELS[sale.payments[0].method] || "Payment"
                      : `${sale.payments.length} methods`;

                  let status: TransactionStatus = "completed";
                  if (isVoided) status = "cancelled";
                  else if (isCredit) status = "owing";

                  const icon = isVoided ? (
                    <XCircle size={18} />
                  ) : isCredit ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <Receipt size={18} />
                  );

                  const iconBgClass = isVoided
                    ? "bg-danger/15 text-danger"
                    : isCredit
                    ? "bg-purple-500/15 text-purple-400"
                    : "bg-brand-accent/15 text-brand-accent-active";

                  return (
                    <li key={sale.id}>
                      <TransactionItemRow
                        href={`/sales/${sale.id}`}
                        icon={icon}
                        iconBgClass={iconBgClass}
                        title={`Sale · ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
                        subtitle={`${formatTransactionTimestamp(sale.createdAtLocal)} · ${methodSummary}`}
                        amount={sale.total}
                        amountPrefix={isVoided ? "−" : ""}
                        status={status}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {visibleSales.length > visibleLimit && (
            <div ref={loadMoreRef} className="py-4 text-center text-xs text-on-surface-muted">
              Loading more sales...
            </div>
          )}
        </div>
      )}

      {hasCapability(user, "POS_SELL") && (
        <FAB href="/pos" label="New sale">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}

