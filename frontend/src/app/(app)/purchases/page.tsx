"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { FAB } from "@/components/ui/FAB";
import { formatCurrency } from "@/lib/format";
import { getPeriodStartIso } from "@/lib/date";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { tenantArray } from "@/lib/local-tenant";
import type { Supplier, Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";

type RestockPeriod = "all" | "month" | "week";

export default function PurchasesPage() {
  const user = useCurrentUser();
  const [period, setPeriod] = useState<RestockPeriod>("all");
  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const result = useLiveQuery(async () => {
    try {
      const [suppliers, products, purchases] = await Promise.all([
        tenantArray<Supplier>(db.suppliers),
        tenantArray<Product>(db.products),
        tenantArray<Purchase>(db.purchases.orderBy("createdAtLocal").reverse()),
      ]);
      return { purchases, suppliers, products, error: null as string | null };
    } catch (err) {
      return {
        purchases: [],
        suppliers: [],
        products: [],
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
        <ScreenHeader title="Restocks" backHref="/products" />
        <PermissionDenied requiredCapabilities={["RECEIVE_STOCK"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Restocks" backHref="/products" />
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
        <ScreenHeader title="Restocks" backHref="/products" />
        <ErrorState message="Couldn't load your restock history." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const canAdd = hasCapability(user, "RECEIVE_STOCK");

  const periodStart = period === "all" ? "" : getPeriodStartIso(period);
  const filteredPurchases = period === "all"
    ? (result?.purchases ?? [])
    : (result?.purchases ?? []).filter((p) => p.createdAtLocal >= periodStart);

  if (result.purchases.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Restocks" backHref="/products" />
        <EmptyState
          icon={Truck}
          title="No restocks recorded"
          description="Record stock coming in from a supplier so what's on the shelf matches the app."
          action={
            canAdd
              ? { label: "Record a restock", href: "/purchases/new" }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Restocks" backHref="/products" />

      <div className="mb-3 flex flex-col gap-2.5">
        <SegmentedControl
          options={[
            { value: "week", label: "This week" },
            { value: "month", label: "This month" },
            { value: "all", label: "All time" },
          ]}
          selected={period}
          onChange={(key) => {
            setPeriod(key as RestockPeriod);
            setVisibleLimit(50);
          }}
          size="compact"
          ariaLabel="Restock period"
        />

        {canAdd && (
          <Link
            href="/purchases/update-stock"
            className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center rounded-[var(--radius-control)] border border-border text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
          >
            Update stock in bulk
          </Link>
        )}
      </div>

      <div>
        {filteredPurchases.length === 0 ? (
          <p className="py-8 text-center text-[length:var(--font-size-body)] text-on-surface-muted">
            No restocks recorded for this period.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 pb-20">
            {filteredPurchases.slice(0, visibleLimit).map((purchase) => {
              const supplier = result.suppliers.find((s) => s.id === purchase.supplierId);
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

      {canAdd && (
        <FAB href="/purchases/new" label="Record a restock">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
