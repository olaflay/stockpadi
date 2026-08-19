"use client";

import { useEffect, useState } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { fetchServerInventory, fetchServerProducts, type ServerProduct, type ServerStock } from "./inventory-client";

export function InventoryView({ worker }: { worker: boolean }) {
  const [products, setProducts] = useState<ServerProduct[]>();
  const [stock, setStock] = useState<ServerStock[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([fetchServerProducts(), fetchServerInventory()]).then(([p, s]) => { setProducts(p.products); setStock(s.stock); }).catch((e) => setError(e instanceof Error ? e.message : "Could not load inventory.")); }, []);
  if (!products && !error) return <Skeleton className="h-48" />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  const quantity = new Map<string, number>();
  for (const row of stock) quantity.set(row.product_id, (quantity.get(row.product_id) ?? 0) + row.quantity);
  return <div className="flex flex-col gap-4"><ScreenHeader title={worker ? "Stock" : "Inventory"} /><p className="text-sm text-on-surface-muted">{worker ? "View stock for your assigned branch." : "Current stock across your business branches."}</p><div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">{products?.map((product) => <div key={product.id} className="flex items-center justify-between px-4 py-3"><div><p className="font-medium text-on-surface">{product.name}</p><p className="text-xs text-on-surface-muted">{product.sku}</p></div><p className={`font-semibold ${(product.low_stock_threshold !== null && (quantity.get(product.id) ?? 0) <= product.low_stock_threshold) ? "text-danger" : "text-on-surface"}`}>{quantity.get(product.id) ?? 0}</p></div>)}</div></div>;
}
