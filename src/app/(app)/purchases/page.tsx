"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { FAB } from "@/components/ui/FAB";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";

// Matches the suppliers_select / purchases_select RLS policies in
// supabase/migrations/20260807054734_rls_policies.sql — accountant gets
// read-only visibility for supplier-balance context, everyone else on this
// list can also write.
const CAN_VIEW_PURCHASES = ["owner", "manager", "inventory_staff", "accountant", "admin"] as const;
const CAN_ADD_PURCHASES = ["owner", "manager", "inventory_staff", "admin"] as const;

export default function PurchasesPage() {
  const user = useCurrentUser();
  const router = useRouter();

  const result = useLiveQuery(async () => {
    try {
      const [purchases, suppliers, products] = await Promise.all([
        db.purchases.orderBy("createdAtLocal").reverse().toArray(),
        db.suppliers.toArray(),
        db.products.toArray(),
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

  if (!hasRole(user, [...CAN_VIEW_PURCHASES])) {
    return (
      <div>
        <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />
        <PermissionDenied requiredRoles={[...CAN_VIEW_PURCHASES]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div>
        <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />
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
        <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />
        <ErrorState message="Couldn't load your restock history." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const canAdd = hasRole(user, [...CAN_ADD_PURCHASES]);

  if (result.purchases.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />
        <div className="flex flex-1 flex-col justify-center px-6">
          <EmptyState
            icon={Truck}
            title="No restocks recorded"
            description="Record stock coming in from a supplier so what's on the shelf matches the app."
          />
          {canAdd && (
            <div className="flex flex-col gap-3 pb-10">
              <Link
                href="/purchases/update-stock"
                className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center rounded-[var(--radius-control)] border border-border text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
              >
                Update stock in bulk
              </Link>
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

  return (
    <div>
      <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />

      {canAdd && (
        <Link
          href="/purchases/update-stock"
          className="mb-3 flex min-h-[var(--touch-target-min)] w-full items-center justify-center rounded-[var(--radius-control)] border border-border text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
        >
          Update stock in bulk
        </Link>
      )}

      <ul className="flex flex-col gap-2 pb-20">
        {result.purchases.map((purchase) => {
          const supplier = result.suppliers.find((s) => s.id === purchase.supplierId);
          const itemCount = purchase.items.reduce((sum, i) => sum + i.quantity, 0);
          const total = purchase.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
          return (
            <li key={purchase.id}>
              <RippleLink
                href={`/purchases/${purchase.id}`}
                className="block rounded-[var(--radius-card)] border border-border px-4 py-3 hover:bg-surface-container transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                    {supplier?.name ?? "Unknown supplier"}
                  </p>
                  <p className="shrink-0 font-mono text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
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

      {canAdd && (
        <FAB href="/purchases/new" label="Record a restock">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
