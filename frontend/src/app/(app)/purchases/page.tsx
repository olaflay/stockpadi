"use client";

import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ClipboardCheck, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { FilterDropdownBar } from "@/components/ui/FilterDropdownBar";
import { formatCurrency } from "@/lib/format";
import { getPeriodStartIso } from "@/lib/date";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { tenantArray } from "@/lib/local-tenant";
import type { Supplier, Purchase } from "@/types/purchase";

type RestockPeriod = "all" | "month" | "week";

export default function PurchasesPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState<RestockPeriod>("all");
  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const result = useLiveQuery(async () => {
    try {
      const [suppliers, purchases] = await Promise.all([
        tenantArray<Supplier>(db.suppliers),
        tenantArray<Purchase>(db.purchases.orderBy("createdAtLocal").reverse()),
      ]);
      return { purchases, suppliers, error: null as string | null };
    } catch (err) {
      return {
        purchases: [],
        suppliers: [],
        error: err instanceof Error ? err.message : "Could not load restock history.",
      };
    }
  }, []);

  const purchaseCount = result?.purchases.length ?? 0;

  useEffect(() => {
    if (purchaseCount <= visibleLimit) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleLimit((previous) => previous + 50);
    }, { threshold: 0.1 });

    const element = loadMoreRef.current;
    if (element) observer.observe(element);
    return () => {
      if (element) observer.unobserve(element);
    };
  }, [purchaseCount, visibleLimit]);

  if (!hasCapability(user, "RECEIVE_STOCK")) {
    return (
      <div>
        <ScreenHeader title="Restock history" fallbackHref="/dashboard" />
        <PermissionDenied requiredCapabilities={["RECEIVE_STOCK"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Restock history" fallbackHref="/dashboard" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Restock history" fallbackHref="/dashboard" />
        <ErrorState message="Couldn't load your restock history." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const stockActions = (
    <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="Stock actions" role="group">
      <RippleLink href="/purchases/new" className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-xl bg-brand-accent px-4 text-sm font-semibold text-brand-accent-contrast">
        <Truck size={17} aria-hidden />Receive delivery
      </RippleLink>
      {hasCapability(user, "SUBMIT_STOCK_COUNT") && (
        <RippleLink href="/stock-count" className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-xl bg-surface-container px-4 text-sm font-semibold text-on-surface">
          <ClipboardCheck size={17} aria-hidden />Count stock
        </RippleLink>
      )}
    </div>
  );

  const periodStart = period === "all" ? "" : getPeriodStartIso(period);
  const suppliersById = new Map(result.suppliers.map((supplier) => [supplier.id, supplier]));
  const filteredPurchases = period === "all"
    ? (result?.purchases ?? [])
    : (result?.purchases ?? []).filter((p) => p.createdAtLocal >= periodStart);

  if (result.purchases.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <ScreenHeader title="Restock history" fallbackHref="/dashboard" />
        {stockActions}
        <EmptyState
          icon={Truck}
          title="No deliveries recorded"
          description="Receive stock from a supplier so what's on the shelf matches the app."
        />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Restock history" fallbackHref="/dashboard" />
      {stockActions}

      <div className="mb-3 flex flex-col gap-2.5">
        <FilterDropdownBar
          filters={[
            {
              id: "period",
              label: "Date Range",
              options: [
                { value: "week", label: "This week" },
                { value: "month", label: "This month" },
                { value: "all", label: "All time" },
              ],
              selectedValue: period,
              onChange: (key) => {
                setPeriod(key as RestockPeriod);
                setVisibleLimit(50);
              },
              renderTriggerLabel: (val) => {
                if (val === "week") return "This week";
                if (val === "month") return "This month";
                return "All Time";
              },
            },
          ]}
          ariaLabel="Filter restock period"
        />

      </div>

      <div>
        {filteredPurchases.length === 0 ? (
          <p className="py-8 text-center text-[length:var(--font-size-body)] text-on-surface-muted">
            No deliveries recorded for this period.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 pb-20">
            {filteredPurchases.slice(0, visibleLimit).map((purchase) => {
              const supplier = purchase.supplierId ? suppliersById.get(purchase.supplierId) : undefined;
              const itemCount = purchase.items.reduce((sum, i) => sum + i.quantity, 0);
              const total = purchase.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
              return (
                <li key={purchase.id}>
                  <RippleLink
                    href={`/purchases/${purchase.id}`}
                    className="block rounded-xl bg-surface-container-low px-4 py-3 border border-border/20 hover:bg-surface-container transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                        {supplier?.name ?? "Unknown supplier"}
                      </p>
                      <p className="shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                        {formatCurrency(total)}
                      </p>
                    </div>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {itemCount} item{itemCount === 1 ? "" : "s"} ·{" "}
                      {new Date(purchase.createdAtLocal).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </RippleLink>
                </li>
              );
            })}
          </ul>
        )}
        {filteredPurchases.length > visibleLimit && (
          <div ref={loadMoreRef} className="py-4 text-center text-sm text-on-surface-muted">
            Loading more...
          </div>
        )}
      </div>

    </div>
  );
}
