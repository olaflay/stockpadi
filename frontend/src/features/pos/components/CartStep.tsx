import { useState } from "react";
import Link from "next/link";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RippleButton } from "@/components/ui/Ripple";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/format";
import { cartLineKey } from "@/features/pos/use-cart";
import type { CartLine } from "@/features/pos/complete-sale";
import type { ParkedSale } from "@/features/pos/parked-sales";
import type { Product } from "@/types/product";

export function CartStep(props: {
  cartLines: CartLine[];
  products: Product[];
  itemCount: number;
  subtotal?: number;
  discount?: number;
  total: number;
  onBack: () => void;
  onClearCart: () => void;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onSetQuantity?: (key: string, qty: number) => void;
  onRemoveLine?: (key: string) => void;
  onSetDiscount?: (amount: number) => void;
  parkedSales?: ParkedSale[];
  onParkSale?: () => void;
  onResumeParkedSale?: (id: string) => void;
  onDeleteParkedSale?: (id: string) => void;
  onContinueToPayment: () => void;
  stockByProduct?: Record<string, number>;
}) {
  const {
    cartLines,
    products,
    itemCount,
    subtotal = props.total,
    discount = 0,
    total,
    onBack,
    onClearCart,
    onIncrement,
    onDecrement,
    onSetQuantity,
    onRemoveLine,
    onSetDiscount,
    parkedSales = [],
    onParkSale,
    onResumeParkedSale,
    onDeleteParkedSale,
    onContinueToPayment,
    stockByProduct,
  } = props;

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountInput, setDiscountInput] = useState(discount > 0 ? String(discount) : "");
  const [showParkedModal, setShowParkedModal] = useState(false);

  // `undefined` means the stock query has not resolved yet. It must NOT be
  // read as "no problem": unresolved blocks checkout and increment.
  // Once resolved, untracked products (stock === undefined) are not artificially clamped to 0.
  const isStockResolved = stockByProduct !== undefined;
  const invalidLines = isStockResolved
    ? cartLines.filter((l) => {
        const stock = stockByProduct?.[l.productId];
        if (stock === undefined) return false; // Untracked inventory does not fail the clamp
        return stock < l.quantity * l.conversionFactor;
      })
    : [];
  const hasOutOfStockItem = invalidLines.length > 0;

  function applyDiscount() {
    const val = parseFloat(discountInput);
    if (!Number.isFinite(val) || val < 0) {
      onSetDiscount?.(0);
    } else {
      onSetDiscount?.(Math.min(val, subtotal));
    }
    setShowDiscountModal(false);
  }

  return (
    <div key="cart" className="flex h-full flex-col gap-4 animate-step-in">
      <ScreenHeader title="Cart" onBack={onBack} />

      <div className="flex items-center justify-between">
        <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          {parkedSales.length > 0 && (
            <button
              type="button"
              onClick={() => setShowParkedModal(true)}
              className="min-h-[var(--touch-target-min)] flex items-center px-2 rounded-[var(--radius-control)] text-[length:var(--font-size-caption)] text-brand-accent font-semibold hover:bg-brand-accent/5 transition-colors"
            >
              Parked ({parkedSales.length})
            </button>
          )}
          {cartLines.length > 0 && onParkSale && (
            <button
              type="button"
              onClick={onParkSale}
              className="min-h-[var(--touch-target-min)] flex items-center px-2 rounded-[var(--radius-control)] text-[length:var(--font-size-caption)] text-on-surface-muted font-medium hover:bg-surface-container transition-colors"
            >
              Hold cart
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Clear all items from the cart?")) onClearCart();
            }}
            aria-label="Clear all items from cart"
            className="min-h-[var(--touch-target-min)] flex items-center px-2 rounded-[var(--radius-control)] text-[length:var(--font-size-caption)] text-danger font-medium hover:bg-danger/5 transition-colors"
          >
            Clear cart
          </button>
        </div>
      </div>

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto pb-2">
        {cartLines.map((line) => {
          const product = products.find((p) => p.id === line.productId);
          if (!product) return null;
          const key = cartLineKey(line.productId, line.unitLabel);
          const stock = stockByProduct?.[line.productId];
          const requestedBase = line.quantity * line.conversionFactor;
          const isOverStock = isStockResolved && stock !== undefined && requestedBase > stock;
          const maxAvailableQty = stock !== undefined ? Math.max(0, Math.floor(stock / line.conversionFactor)) : line.quantity;
          const canIncrement = !isStockResolved
            ? false
            : stock === undefined
              ? true
              : (line.quantity + 1) * line.conversionFactor <= stock;

          return (
            <li
              key={key}
              className={`flex flex-col gap-2 rounded-[var(--radius-card)] px-4 py-3 text-[length:var(--font-size-body)] transition-colors ${
                isOverStock ? "bg-danger-container text-on-danger-container" : "bg-surface-container"
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
                    className={`flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full font-semibold text-[length:var(--font-size-title)] transition-colors ${
                      isOverStock
                        ? "bg-danger/15 text-danger hover:bg-danger/25"
                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                    }`}
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
                    className={`flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full font-semibold text-[length:var(--font-size-title)] transition-colors ${
                      !canIncrement
                        ? "bg-surface-container/40 text-on-surface-muted opacity-40 cursor-not-allowed"
                        : isOverStock
                        ? "bg-danger/15 text-danger hover:bg-danger/25"
                        : "bg-surface-container text-on-surface hover:bg-surface-container-high"
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

      <div className="sticky bottom-0 z-20 mt-auto -mx-gutter sm:-mx-gutter-lg flex flex-col gap-3 border-t border-border/60 bg-surface/95 backdrop-blur-md px-gutter sm:px-gutter-lg pt-3 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        {hasOutOfStockItem && (
          <div className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-medium text-danger flex items-center justify-between">
            <span>
              {invalidLines.length} item{invalidLines.length === 1 ? "" : "s"} exceed available stock. Adjust or remove to proceed.
            </span>
          </div>
        )}
        {!isStockResolved && cartLines.length > 0 && (
          <div className="rounded-[var(--radius-control)] border border-border/60 bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-muted">
            Checking stock before checkout…
          </div>
        )}

        {discount > 0 ? (
          <div className="flex flex-col gap-1 text-[length:var(--font-size-caption)]">
            <div className="flex items-center justify-between text-on-surface-muted">
              <span>Subtotal</span>
              <span className="font-number tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-brand-accent font-medium">
              <div className="flex items-center gap-2">
                <span>Discount</span>
                <button
                  type="button"
                  onClick={() => {
                    setDiscountInput(String(discount));
                    setShowDiscountModal(true);
                  }}
                  className="text-xs underline hover:opacity-80"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onSetDiscount?.(0)}
                  className="text-xs text-danger underline hover:opacity-80"
                >
                  Remove
                </button>
              </div>
              <span className="font-number tabular-nums">−{formatCurrency(discount)}</span>
            </div>
          </div>
        ) : (
          onSetDiscount && cartLines.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDiscountInput("");
                  setShowDiscountModal(true);
                }}
                className="text-[length:var(--font-size-caption)] text-brand-accent font-semibold hover:underline"
              >
                + Add discount
              </button>
            </div>
          )
        )}

        <div className="flex items-center justify-between gap-3 font-semibold text-on-surface">
          <span>Total</span>
          <span className="font-number text-[length:var(--font-size-title)] font-semibold tabular-nums">{formatCurrency(total)}</span>
        </div>
        <RippleButton
          type="button"
          onClick={onContinueToPayment}
          disabled={cartLines.length === 0 || hasOutOfStockItem || !isStockResolved}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          Continue to payment
        </RippleButton>
      </div>

      {/* Discount Modal */}
      {showDiscountModal && (
        <Modal
          isOpen={showDiscountModal}
          onClose={() => setShowDiscountModal(false)}
          title="Apply Discount"
        >
          <div className="flex flex-col gap-4">
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Enter discount amount. Max allowable is subtotal ({formatCurrency(subtotal)}).
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cart-discount-input" className="text-xs font-medium text-on-surface-muted">
                Discount Amount
              </label>
              <input
                id="cart-discount-input"
                type="number"
                min="0"
                max={subtotal}
                step="50"
                placeholder="0.00"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border/80 bg-surface-container px-3 text-[length:var(--font-size-body)] text-on-surface outline-none focus:ring-2 focus:ring-brand-accent"
              />
            </div>
            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2">
              {[100, 200, 500, 1000].filter((amt) => amt <= subtotal).map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDiscountInput(String(amt))}
                  className="rounded-[var(--radius-control)] bg-surface-container px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  ₦{amt}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-surface-container px-4 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyDiscount}
                className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-4 text-xs font-semibold text-brand-accent-contrast hover:opacity-90 transition-opacity"
              >
                Apply
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Parked Sales Modal */}
      {showParkedModal && (
        <Modal
          isOpen={showParkedModal}
          onClose={() => setShowParkedModal(false)}
          title="Parked Sales"
        >
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Select a held cart to resume or discard.
            </p>
            {parkedSales.length === 0 ? (
              <p className="py-4 text-center text-xs text-on-surface-muted">No parked sales.</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
                {parkedSales.map((sale) => {
                  const saleQty = sale.lines.reduce((s, l) => s + l.quantity, 0);
                  const saleSubtotal = sale.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
                  const saleTotal = Math.max(0, saleSubtotal - sale.discount);

                  return (
                    <li
                      key={sale.id}
                      className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-container p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-on-surface">{sale.label}</span>
                        <span className="font-number font-bold text-on-surface tabular-nums">
                          {formatCurrency(saleTotal)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-on-surface-muted">
                        <span>{saleQty} item{saleQty === 1 ? "" : "s"}{sale.discount > 0 ? ` (incl. -${formatCurrency(sale.discount)} discount)` : ""}</span>
                        <span className="text-[10px]">{new Date(sale.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div className="flex gap-2 pt-1 border-t border-border/40">
                        <button
                          type="button"
                          onClick={() => {
                            onResumeParkedSale?.(sale.id);
                            setShowParkedModal(false);
                          }}
                          className="flex-1 py-1.5 rounded-[var(--radius-control)] bg-brand-accent text-brand-accent-contrast font-semibold hover:opacity-90 transition-opacity"
                        >
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Discard this parked cart?")) {
                              onDeleteParkedSale?.(sale.id);
                            }
                          }}
                          className="px-3 py-1.5 rounded-[var(--radius-control)] bg-danger/10 text-danger font-medium hover:bg-danger/20 transition-colors"
                        >
                          Discard
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
