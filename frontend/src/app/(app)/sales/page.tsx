"use client";

import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Receipt, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { FAB } from "@/components/ui/FAB";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { WORKER_EXPERIENCE_ACCOUNT_TYPES } from "@/features/auth/authorization";
import type { PaymentMethod } from "@/types/sale";
import { fetchServerSales } from "@/features/sales/sales-client";
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

  const result = useLiveQuery(async () => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let sales;
      try {
        sales = (await fetchServerSales()).filter((sale) => sale.createdAtLocal >= todayStart.toISOString());
      } catch {
        sales = await tenantArray<Sale>(db.sales.where("createdAtLocal").aboveOrEqual(todayStart.toISOString()));
      }
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
    result?.sales.filter((sale) => user.accountType !== "WORKER" || sale.createdByUserId === user.id) ?? [];

  if (!hasAccountType(user, WORKER_EXPERIENCE_ACCOUNT_TYPES)) {
    return (
      <div>
        <ScreenHeader title="Sales" onBack={() => router.push("/dashboard")} />
        <PermissionDenied requiredAccountTypes={WORKER_EXPERIENCE_ACCOUNT_TYPES} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Sales" onBack={() => router.push("/dashboard")} />
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
        <ScreenHeader title="Sales" onBack={() => router.push("/dashboard")} />
        <ErrorState message="Couldn't load today's sales." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (visibleSales.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Sales" onBack={() => router.push("/dashboard")} />
        <EmptyState
          icon={Receipt}
          title="No sales yet today"
          description="Completed sales show up here, tap any one to see its full receipt."
          fullScreen
        />
        {hasAccountType(user, WORKER_EXPERIENCE_ACCOUNT_TYPES) && (
          <FAB href="/pos" label="New sale">
            <Plus size={26} aria-hidden />
          </FAB>
        )}
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Sales" onBack={() => router.push("/dashboard")} />
      <ul className="flex flex-col gap-2">
        {visibleSales.map((sale) => {
          const methodSummary = sale.payments.length === 1
            ? PAYMENT_LABELS[sale.payments[0].method]
            : `${sale.payments.length} methods`;
          const itemCount = sale.items.reduce((sum, item) => sum + item.quantity, 0);
          return (
            <li key={sale.id}>
              <RippleLink
                href={`/sales/${sale.id}`}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 hover:bg-surface-container active:scale-[0.99] transition-all"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[length:var(--font-size-body-lg)] font-medium tabular-nums text-on-surface">
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
      {hasAccountType(user, WORKER_EXPERIENCE_ACCOUNT_TYPES) && (
        <FAB href="/pos" label="New sale">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
