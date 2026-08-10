import { formatCurrency } from "@/lib/format";
import type { Product } from "@/types/product";

/**
 * Cashiers and other non-editing roles still get a real screen: name,
 * price, and current stock, just not the edit form. Never a hard wall —
 * see finding 3.1/#10 in docs/RESEARCH-AND-PLAN.md.
 */
export function ProductReadOnlyDetails({
  product,
  totalStock,
  stockValueClass,
}: {
  product: Product;
  totalStock: number | undefined;
  stockValueClass: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-focus-block)] bg-surface-container p-5">
        <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Current stock</p>
        <p className={`mt-1 text-[length:var(--font-size-display)] font-semibold ${stockValueClass}`}>
          {totalStock ?? "…"}
        </p>
      </div>
      <dl className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[length:var(--font-size-body)] text-on-surface-muted">SKU</dt>
          <dd className="text-[length:var(--font-size-body)] font-medium text-on-surface">{product.sku}</dd>
        </div>
        {product.barcode && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[length:var(--font-size-body)] text-on-surface-muted">Barcode</dt>
            <dd className="text-[length:var(--font-size-body)] font-medium text-on-surface">{product.barcode}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[length:var(--font-size-body)] text-on-surface-muted">
            Sell price ({product.unitLabel || "piece"})
          </dt>
          <dd className="text-[length:var(--font-size-body)] font-medium text-on-surface">
            {formatCurrency(product.sellPrice)}
          </dd>
        </div>
        {product.altUnitLabel && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[length:var(--font-size-body)] text-on-surface-muted">
              Sell price ({product.altUnitLabel})
            </dt>
            <dd className="text-[length:var(--font-size-body)] font-medium text-on-surface">
              {formatCurrency(product.altUnitSellPrice ?? 0)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
