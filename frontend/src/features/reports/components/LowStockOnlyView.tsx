"use client";

import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Product } from "@/types/product";

/**
 * "Limited" for Inventory Staff is undefined in the PRD's permission matrix.
 * Interpreted here as: low-stock visibility only, no sales figures. Flagged
 * per AGENTS.md, confirm before this reads as a locked decision.
 */
export function LowStockOnlyView({
  products,
  lowStockProducts,
}: {
  products: Product[];
  lowStockProducts: Product[];
}) {
  const router = useRouter();

  return (
    <>
      <p className="mb-4 text-[length:var(--font-size-body)] text-on-surface-muted">
        Your role sees low-stock visibility only.
      </p>
      {products.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-6 min-h-[360px]">
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Low-stock alerts will show up here once products exist."
            action={{ label: "Add a product", onClick: () => router.push("/products/new") }}
          />
        </div>
      ) : lowStockProducts.length === 0 ? (
        <p className="text-[length:var(--font-size-body)] text-on-surface">Nothing is low on stock right now.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lowStockProducts.map((product) => (
            <li key={product.id} className="rounded-[var(--radius-card)] bg-surface-container-low px-4 py-3 text-on-surface">
              {product.name}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
