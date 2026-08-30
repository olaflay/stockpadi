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
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { serverGet } from "@/features/operations/server-client";
import { tenantArray } from "@/lib/local-tenant";
import type { Supplier, Purchase } from "@/types/purchase";
import type { Product } from "@/types/product";

// Matches the suppliers_select / purchases_select RLS policies in
// supabase/migrations/20260807054734_rls_policies.sql — accountant gets
// read-only visibility for supplier-balance context, everyone else on this
// list can also write.
const CAN_VIEW_PURCHASES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;
const CAN_ADD_PURCHASES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

export default function PurchasesPage() {
  const user = useCurrentUser();
  const router = useRouter();

  const result = useLiveQuery(async () => {
    try {
      let purchases;
      const [suppliers, products] = await Promise.all([tenantArray<Supplier>(db.suppliers), tenantArray<Product>(db.products)]);
      try {
        const remote = await serverGet<{ purchases: Array<Record<string, unknown>> }>("/api/purchases");
        purchases = remote.purchases.map((purchase) => ({ id: purchase.id as string, clientId: purchase.client_id as string, branchId: purchase.branch_id as string, supplierId: purchase.supplier_id as string, createdAtLocal: purchase.created_at as string, items: (purchase.items as Array<Record<string, unknown>> ?? []).map((item) => ({ productId: item.product_id as string, quantity: Number(item.quantity), unitCost: Number(item.unit_cost) })) }));
      } catch {
        purchases = await tenantArray<Purchase>(db.purchases.orderBy("createdAtLocal").reverse());
      }
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

  if (!hasAccountType(user, CAN_VIEW_PURCHASES)) {
    return (
      <div>
        <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />
        <PermissionDenied requiredAccountTypes={CAN_VIEW_PURCHASES} />
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

  const canAdd = hasAccountType(user, CAN_ADD_PURCHASES);

  if (result.purchases.length === 0) {
    return (
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Restocks" onBack={() => router.push("/products")} />
        <EmptyState
          icon={Truck}
          title="No restocks recorded"
          description="Record stock coming in from a supplier so what's on the shelf matches the app."
          action={
            canAdd
              ? { label: "Record a restock", onClick: () => router.push("/purchases/new") }
              : undefined
          }
          fullScreen
        />
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
