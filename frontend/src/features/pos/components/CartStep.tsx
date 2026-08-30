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
  onContinueToPayment: () => void;
}) {
  const { cartLines, products, itemCount, total, onBack, onClearCart, onIncrement, onDecrement, onContinueToPayment } =
    props;

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
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3 text-[length:var(--font-size-body)]"
            >
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
                  onClick={() => onIncrement(key)}
                  className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full border border-border bg-surface text-on-surface font-semibold text-[length:var(--font-size-title)] hover:bg-surface-container-high transition-colors"
                  aria-label={`Increase ${product.name} (${line.unitLabel}) quantity`}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-3 border-t border-border bg-surface px-5 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3 font-semibold text-on-surface">
          <span>Total</span>
          <span className="font-number text-[length:var(--font-size-title)] font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>
        <RippleButton
          type="button"
          onClick={onContinueToPayment}
          disabled={cartLines.length === 0}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          Continue to payment
        </RippleButton>
      </div>
    </div>
  );
}
