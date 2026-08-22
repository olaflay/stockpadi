"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { Truck } from "lucide-react";

const CAN_VIEW_PURCHASES = ["owner", "manager", "inventory_staff", "accountant", "admin"] as const;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const user = useCurrentUser();
  const router = useRouter();

  const data = useLiveQuery(async () => {
    const purchase = await db.purchases.get(id);
    if (!purchase) return { purchase: null, supplier: null, branch: null, products: [] };

    const [supplier, branch, products] = await Promise.all([
      db.suppliers.get(purchase.supplierId),
      db.branches.get(purchase.branchId),
      db.products.toArray(),
    ]);

    return { purchase, supplier, branch, products };
  }, [id]);

  if (!hasRole(user, [...CAN_VIEW_PURCHASES])) {
    return (
      <div>
        <ScreenHeader title="Restock Info" onBack={() => router.push("/purchases")} />
        <PermissionDenied requiredRoles={[...CAN_VIEW_PURCHASES]} />
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div>
        <ScreenHeader title="Restock Info" onBack={() => router.push("/purchases")} />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { purchase, supplier, branch, products } = data;

  if (purchase === null) {
    return (
      <div>
        <ScreenHeader title="Restock Info" onBack={() => router.push("/purchases")} />
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Restock record not found.</p>
      </div>
    );
  }

  const totalCost = purchase.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  return (
    <div className="flex h-full flex-col gap-6">
      <ScreenHeader title="Restock Info" onBack={() => router.push("/purchases")} />

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto pb-2">
        <section className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-container px-4 py-3 animate-step-in">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-accent/10">
              <Truck size={18} className="text-brand-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {new Date(purchase.createdAtLocal).toLocaleString("en-NG", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                {supplier?.name ?? "Unknown Supplier"}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[length:var(--font-size-title-lg)] font-semibold text-on-surface">
              {formatCurrency(totalCost)}
            </p>
            {branch && (
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                {branch.name}
              </p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">Items Received</h2>
          <ul className="divide-y divide-border">
            {purchase.items.map((item, index) => {
              const product = products.find((p) => p.id === item.productId);
              return (
                <li key={index} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[length:var(--font-size-body)] text-on-surface">
                      {product?.name ?? "Unknown Product"}
                    </p>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {item.quantity} {product?.unitLabel ?? "piece"} × {formatCurrency(item.unitCost)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[length:var(--font-size-body)] font-medium text-on-surface">
                    {formatCurrency(item.quantity * item.unitCost)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
