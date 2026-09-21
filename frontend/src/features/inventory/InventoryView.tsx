"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import type { Product } from "@/types/product";
import { getStockByProduct } from "@/features/inventory/product-insights";

export function InventoryView({ worker }: { worker: boolean }) {
  const user = useCurrentUser();
  const [retryToken, setRetryToken] = useState(0);
  const assignedBranchKey = (user.branchIds ?? []).join(",");
  const result = useLiveQuery(async () => {
    try {
      const products = (await tenantArray<Product>(db.products.orderBy("name")))
        .filter((product) => !product.archived);
      const quantity = await getStockByProduct(worker ? (user.branchIds ?? []) : null);
      return { products, quantity, error: null as string | null };
    } catch (cause) {
      return { products: [] as Product[], quantity: new Map<string, number>(), error: cause instanceof Error ? cause.message : "Could not load inventory." };
    }
  }, [worker, assignedBranchKey, retryToken]);

  if (!result) return <Skeleton className="h-48" />;
  if (result.error) return <ErrorState message={result.error} onRetry={() => setRetryToken((value) => value + 1)} />;
  return <div className="flex flex-col gap-4"><ScreenHeader title={worker ? "Stock" : "Inventory"} /><p className="text-sm text-on-surface-muted">{worker ? "View stock for your assigned branch." : "Current stock across your business branches."}</p><div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">{result.products.map((product) => <div key={product.id} className="flex items-center justify-between px-4 py-3"><div><p className="font-medium text-on-surface">{product.name}</p><p className="text-xs text-on-surface-muted">{product.sku}</p></div><p className={`font-semibold ${(product.lowStockThreshold !== null && (result.quantity.get(product.id) ?? 0) <= product.lowStockThreshold) ? "text-danger" : "text-on-surface"}`}>{result.quantity.get(product.id) ?? 0}</p></div>)}</div></div>;
}
