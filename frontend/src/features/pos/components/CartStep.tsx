import Link from "next/link";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { cartLineKey } from "@/features/pos/use-cart";
import type { CartLine } from "@/features/pos/complete-sale";
import type { Product } from "@/types/product";

export function CartStep(props: {
  cartLines: CartLine[];
  products: Product[];
  itemCount: number;
  total: number;
  onBack: () => void;
  onClearCart: () => void;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onSetQuantity?: (key: string, qty: number) => void;
  onRemoveLine?: (key: string) => void;
  onContinueToPayment: () => void;
  stockByProduct?: Record<string, number>;
}) {
  const {
    cartLines,
    products,
    itemCount,
    total,
    onBack,
    onClearCart,
    onIncrement,
    onDecrement,
    onSetQuantity,
    onRemoveLine,
    onContinueToPayment,
    stockByProduct,
  } = props;

  const isStockTracked = stockByProduct !== undefined;
  const invalidLines = isStockTracked
    ? cartLines.filter((l) => (stockByProduct[l.productId] ?? 0) < l.quantity * l.conversionFactor)
    : [];
  const hasOutOfStockItem = invalidLines.length > 0;

  return (
    <div key="cart" className="flex h-full flex-col gap-4 animate-step-in">
      <ScreenHeader title="Cart" onBack={onBack} />

      <div className="flex items-center justify-between">
        <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onClearCart}
          aria-label="Clear all items from cart"
          className="text-[length:var(--font-size-caption)] text-danger font-medium hover:underline"
        >
          Clear cart
        </button>
      </div>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {cartLines.map((line) => {
          const product = products.find((p) => p.id === line.productId);
          if (!product) return null;
          const key = cartLineKey(line.productId, line.unitLabel);
          const stock = stockByProduct?.[line.productId] ?? 0;
          const requestedBase = line.quantity * line.conversionFactor;
          const isOverStock = isStockTracked && requestedBase > stock;
          const maxAvailableQty = Math.max(0, Math.floor(stock / line.conversionFactor));
          const canIncrement = !isStockTracked || (line.quantity + 1) * line.conversionFactor <= stock;

          return (
            <li
              key={key}
              className={`flex flex-col gap-2 rounded-[var(--radius-card)] border px-4 py-3 text-[length:var(--font-size-body)] transition-colors ${
                isOverStock ? "border-danger/50 bg-danger/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-on-surface">{product.name}</p>
                  <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                    {formatCurrency(line.unitPrice)} / {line.unitLabel}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDecrement(key)}
                    className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full border border-border bg-surface text-on-surface font-semibold text-[length:var(--font-size-title)] hover:bg-surface-container-high transition-colors"
                    aria-label={`Decrease ${product.name} (${line.unitLabel}) quantity`}
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-medium text-on-surface">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (canIncrement) {
                        onIncrement(key);
                      }
                    }}
                    disabled={!canIncrement}
                    className={`flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full border font-semibold text-[length:var(--font-size-title)] transition-colors ${
                      canIncrement
                        ? "border-border bg-surface text-on-surface hover:bg-surface-container-high"
                        : "border-border/40 bg-surface-container text-on-surface-muted opacity-40 cursor-not-allowed"
                    }`}
                    aria-label={`Increase ${product.name} (${line.unitLabel}) quantity`}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Zero-dead-end warning and quick-recovery CTAs for out-of-stock / over-stock lines */}
              {isOverStock && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-danger/20 pt-2 text-xs">
                  <span className="font-semibold text-danger">
                    {stock <= 0 ? "Out of stock on shelf" : `Only ${stock} in stock (requested ${requestedBase})`}
                  </span>
                  <div className="flex items-center gap-2">
                    {stock > 0 && maxAvailableQty > 0 && onSetQuantity && (
                      <button
                        type="button"
                        onClick={() => onSetQuantity(key, maxAvailableQty)}
                        className="rounded bg-danger/10 px-2.5 py-1 font-bold text-danger hover:bg-danger/20 transition-colors"
                      >
                        Adjust to {maxAvailableQty}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => (onRemoveLine ? onRemoveLine(key) : onDecrement(key))}
                      className="text-danger font-medium underline hover:opacity-80 transition-opacity"
                    >
                      Remove
                    </button>
                    <Link
                      href="/purchases/new"
                      className="text-brand-accent font-semibold underline hover:opacity-80 transition-opacity"
                    >
                      Restock
                    </Link>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-3 border-t border-border bg-surface px-5 pt-3 pb-4">
        {hasOutOfStockItem && (
          <div className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger flex items-center justify-between">
            <span>
              {invalidLines.length} item{invalidLines.length === 1 ? "" : "s"} exceed available stock. Adjust or remove to proceed.
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 font-semibold text-on-surface">
          <span>Total</span>
          <span className="font-number text-[length:var(--font-size-title)] font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>
        <RippleButton
          type="button"
          onClick={onContinueToPayment}
          disabled={cartLines.length === 0 || hasOutOfStockItem}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          Continue to payment
        </RippleButton>
      </div>
    </div>
  );
}
