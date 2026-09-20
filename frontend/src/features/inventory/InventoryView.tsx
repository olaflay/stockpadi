"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { getPendingStockMovementIds } from "./stock";
import type { Product } from "@/types/product";

export function InventoryView({ worker }: { worker: boolean }) {
  const user = useCurrentUser();
  const [retryToken, setRetryToken] = useState(0);
  const assignedBranchKey = (user.branchIds ?? []).join(",");
  const result = useLiveQuery(async () => {
    try {
      const products = (await tenantArray<Product>(db.products.orderBy("name")))
        .filter((product) => !product.archived);
      const assignedBranches = worker ? new Set(user.branchIds ?? []) : null;
      const projections = (await tenantArray(db.inventoryStock))
        .filter((row) => !assignedBranches || assignedBranches.has(row.branchId));
      const movements = (await tenantArray(db.stockMovements))
        .filter((row) => !assignedBranches || assignedBranches.has(row.branchId));
      const quantity = new Map<string, number>();

      // The server projection is the baseline. Pending local ledger events
      // are layered on top so an offline worker sees their own sale/receipt
      // immediately without overwriting another branch's stock.
      for (const row of projections) quantity.set(row.productId, (quantity.get(row.productId) ?? 0) + row.quantity);
      if (projections.length > 0) {
        const pendingIds = await getPendingStockMovementIds();
        for (const movement of movements) {
          if (pendingIds.has(movement.clientId)) quantity.set(movement.productId, (quantity.get(movement.productId) ?? 0) + movement.quantityDelta);
        }
      } else {
        for (const movement of movements) quantity.set(movement.productId, (quantity.get(movement.productId) ?? 0) + movement.quantityDelta);
      }
      return { products, quantity, error: null as string | null };
    } catch (cause) {
      return { products: [] as Product[], quantity: new Map<string, number>(), error: cause instanceof Error ? cause.message : "Could not load inventory." };
    }
  }, [worker, assignedBranchKey, retryToken]);

  if (!result) return <Skeleton className="h-48" />;
  if (result.error) return <ErrorState message={result.error} onRetry={() => setRetryToken((value) => value + 1)} />;
  return <div className="flex flex-col gap-4"><ScreenHeader title={worker ? "Stock" : "Inventory"} /><p className="text-sm text-on-surface-muted">{worker ? "View stock for your assigned branch." : "Current stock across your business branches."}</p><div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">{result.products.map((product) => <div key={product.id} className="flex items-center justify-between px-4 py-3"><div><p className="font-medium text-on-surface">{product.name}</p><p className="text-xs text-on-surface-muted">{product.sku}</p></div><p className={`font-semibold ${(product.lowStockThreshold !== null && (result.quantity.get(product.id) ?? 0) <= product.lowStockThreshold) ? "text-danger" : "text-on-surface"}`}>{result.quantity.get(product.id) ?? 0}</p></div>)}</div></div>;
}
