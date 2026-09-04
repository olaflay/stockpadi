import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Camera } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { feedbackAddToCart, feedbackScanSuccess, feedbackError } from "@/lib/feedback";

// Loaded on demand — @zxing/library is a non-trivial decode library only
// actually needed once the camera icon is tapped, but was previously
// statically imported into this screen's initial bundle regardless.
const BarcodeScanner = dynamic(() => import("@/components/ui/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { getRecentCategoryIds, markCategoryUsed } from "@/lib/last-used-category";
import { cartLineKey } from "@/features/pos/use-cart";
import { parsePosQuery } from "@/lib/parse-pos-query";
import type { CartLine } from "@/features/pos/complete-sale";
import type { Product } from "@/types/product";
import type { LocalCategory } from "@/lib/db";

export function BrowseStep(props: {
  hasNoBranches: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  categories: LocalCategory[] | undefined;
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
  filteredProducts: Product[];
  allProducts: Product[];
  cart: Record<string, CartLine>;
  onAddToCart: (productId: string, unitPrice: number, unitLabel: string, conversionFactor: number, qty?: number) => void;
  onIncrementLine: (key: string) => void;
  onDecrementLine: (key: string) => void;
  itemCount: number;
  total: number;
  onReviewCart: () => void;
  onGoToSettings: () => void;
  stockByProduct?: Record<string, number>;
}) {
  const {
    hasNoBranches,
    query,
    onQueryChange,
    categories,
    selectedCategoryId,
    onSelectCategory,
    filteredProducts,
    allProducts,
    cart,
    onAddToCart,
    onIncrementLine,
    onDecrementLine,
    itemCount,
    total,
    onReviewCart,
    onGoToSettings,
    stockByProduct,
  } = props;

  const router = useRouter();
  const { showToast } = useToast();

  function handleOutOfStockAttempt(product: Product) {
    feedbackError();
    showToast(`Out of stock: "${product.name}" has 0 on shelf.`, "danger", {
      label: "Restock",
      onClick: () => router.push("/purchases/new"),
    });
  }

  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  // Programmatic focus ref — lets handleFreshAdd re-focus the search
  // input after each add so the mobile keyboard never collapses between
  // products. H7: accelerator for expert cashiers building large orders.
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [prevProductsLength, setPrevProductsLength] = useState(0);
  const [prevCategoryId, setPrevCategoryId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  if (filteredProducts.length !== prevProductsLength || selectedCategoryId !== prevCategoryId) {
    setPrevProductsLength(filteredProducts.length);
    setPrevCategoryId(selectedCategoryId);
    setVisibleLimit(50);
  }

  useEffect(() => {
    if (filteredProducts.length <= visibleLimit) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleLimit((prev) => prev + 50);
      }
    }, { threshold: 0.1 });

    const el = loadMoreRef.current;
    if (el) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
    };
  }, [filteredProducts.length, visibleLimit]);

  /**
   * Fresh add — called when a product with qty 0 is added for the first time
   * (tap-to-add, Enter key, or barcode scan-to-add).
   *
   * After adding: clears the search query immediately (cashier needs to find
   * the NEXT product, not re-read the last one) and re-focuses the input so
   * the mobile keyboard stays open for instant typing. No extra tap needed.
   *
   * Stepper +/− handlers intentionally do NOT go through here — adjusting
   * an existing line quantity is not a "new product search" action, so
   * clearing the query there would be confusing and incorrect.
   */
  function handleFreshAdd(
    productId: string,
    unitPrice: number,
    unitLabel: string,
    conversionFactor: number,
    qty = 1
  ) {
    feedbackAddToCart();
    onAddToCart(productId, unitPrice, unitLabel, conversionFactor, qty);
    // Clear query only when there was one — avoids a no-op state update
    // and the associated re-render when browsing without a search term.
    if (query) onQueryChange("");
    // requestAnimationFrame lets React flush the query-clear state update
    // first so the input is already in its empty, ready state when the
    // focus lands — prevents a brief flash of the old query value.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  return (
    <div key="browse" className="flex flex-col gap-4 animate-step-in">
      <ScreenHeader title="Sell" />

      {hasNoBranches && (
        <div className="rounded-[var(--radius-card)] bg-warning-container p-4 text-on-warning-container">
          <h3 className="font-semibold text-[length:var(--font-size-body-lg)] mb-1">No branches configured</h3>
          <p className="text-[length:var(--font-size-body)] mb-3">
            You must create at least one branch in Settings before you can record sales.
          </p>
          <button
            type="button"
            onClick={onGoToSettings}
            className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-warning px-4 text-on-warning font-medium text-[length:var(--font-size-body)] hover:opacity-90 transition-opacity"
          >
            Go to Settings
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search products"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(e) => {
              // Enter → immediately add the first visible single-unit result.
              // Dual-unit products are skipped: the cashier must still pick
              // a unit, so Enter would guess wrong. H7: expert accelerator.
              if (
                e.key === "Enter" &&
                !hasNoBranches &&
                filteredProducts.length > 0
              ) {
                const first = filteredProducts[0];
                if (!first.altUnitLabel) {
                  const { qty } = parsePosQuery(query);
                  handleFreshAdd(first.id, first.sellPrice, first.unitLabel, 1, qty);
                  e.preventDefault();
                }
              }
            }}
            disabled={hasNoBranches}
            placeholder={hasNoBranches ? "Configure branch in settings to search" : "Search products"}
            className={`min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 text-[length:var(--font-size-body)] text-on-surface disabled:opacity-50 ${
              itemCount > 0 ? "pr-16" : "pr-3"
            }`}
          />
          {/* Live cart count badge — always visible even when the sticky
              footer is scrolled out of view during a large order. H1:
              visibility of system status. WCAG 4.1.3: status messages. */}
          {itemCount > 0 && (
            <span
              aria-live="polite"
              aria-label={`${itemCount} item${itemCount === 1 ? "" : "s"} in cart`}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-brand-accent/15 px-2 py-0.5 font-number text-[length:var(--font-size-caption)] font-semibold tabular-nums text-brand-accent"
            >
              ×{itemCount}
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={hasNoBranches}
          onClick={() => setScanning(true)}
          aria-label="Scan barcode"
          className="flex min-h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface text-on-surface hover:bg-surface-container disabled:opacity-50 transition-colors"
        >
          <Camera size={18} aria-hidden />
        </button>
      </div>

      {scanning && (
        <BarcodeScanner
          onResult={(res) => {
            // Exact barcode hit on a single-unit product: auto-add and
            // immediately reopen the camera — "scan-add-repeat" loop.
            // No tap needed per item. The cashier never leaves scan mode.
            // Multi-match or dual-unit falls through to manual selection.
            const exactMatch = allProducts.filter(
              (p) => p.barcode === res && !p.altUnitLabel
            );
            if (exactMatch.length === 1) {
              feedbackScanSuccess();
              const p = exactMatch[0];
              handleFreshAdd(p.id, p.sellPrice, p.unitLabel, 1);
              setScanning(false);
              // Reopen camera after React flushes so the BarcodeScanner
              // component fully unmounts/remounts rather than receiving a
              // stale stream from the previous instance.
              requestAnimationFrame(() => setScanning(true));
            } else {
              onQueryChange(res);
              setScanning(false);
            }
          }}
          onCancel={() => setScanning(false)}
        />
      )}

      {/* Category filter chips */}
      {categories && categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`min-h-[var(--touch-target-min)] shrink-0 rounded-full px-4 py-1 text-sm font-medium transition-colors ${
              selectedCategoryId === null
                ? "bg-brand-accent text-brand-accent-contrast"
                : "bg-surface-container hover:bg-surface-container-high text-on-surface"
            }`}
          >
            All Items
          </button>
          {(() => {
            // Recently-used categories first — a busy cashier reaches the
            // categories they actually sell from without scrolling past
            // ones they never touch. See src/lib/last-used-category.ts.
            const recentIds = getRecentCategoryIds();
            const recentSet = new Set(recentIds);
            const recentFirst = [
              ...recentIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is (typeof categories)[number] => Boolean(c)),
              ...categories.filter((c) => !recentSet.has(c.id)),
            ];
            return recentFirst;
          })().map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                onSelectCategory(cat.id);
                markCategoryUsed(cat.id);
              }}
              className={`min-h-[var(--touch-target-min)] shrink-0 rounded-full px-4 py-1 text-sm font-medium transition-colors ${
                selectedCategoryId === cat.id
                  ? "bg-brand-accent text-brand-accent-contrast"
                  : "bg-surface-container hover:bg-surface-container-high text-on-surface"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <NoResultsState query={query} />
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {filteredProducts.slice(0, visibleLimit).map((product, idx) => {
            const baseKey = cartLineKey(product.id, product.unitLabel);
            const baseQty = cart[baseKey]?.quantity ?? 0;
            const altKey = product.altUnitLabel ? cartLineKey(product.id, product.altUnitLabel) : null;
            const altQty = altKey ? (cart[altKey]?.quantity ?? 0) : 0;
            const stock = stockByProduct?.[product.id] ?? 0;
            const isOutOfStock = stockByProduct !== undefined && stock <= 0;
            const isLowStock = !isOutOfStock && stockByProduct !== undefined && stock <= (product.lowStockThreshold ?? 5);

            return (
            <li key={product.id}>
              {product.altUnitLabel && product.altUnitConversionFactor && product.altUnitSellPrice !== null ? (
                /* Dual-unit row: base unit pill + alt unit pill */
                <div
                  id={idx === 0 ? "tour-pos-item" : undefined}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center gap-2 rounded-[var(--radius-card)] border border-border px-4 py-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                      {product.name}
                    </span>
                    {isOutOfStock ? (
                      <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                        Out of stock
                      </span>
                    ) : isLowStock ? (
                      <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                        {stock} left
                      </span>
                    ) : null}
                  </div>

                  {/* Base unit — inline stepper if already in cart */}
                  {baseQty > 0 ? (
                    <InlineStepper
                      qty={baseQty}
                      label={`${product.name} (${product.unitLabel})`}
                      onDecrement={() => onDecrementLine(baseKey)}
                      onIncrement={() => onIncrementLine(baseKey)}
                      disabled={hasNoBranches}
                    />
                  ) : (
                    <RippleButton
                      type="button"
                      onClick={() =>
                        isOutOfStock
                          ? handleOutOfStockAttempt(product)
                          : handleFreshAdd(product.id, product.sellPrice, product.unitLabel, 1)
                      }
                      disabled={hasNoBranches}
                      aria-label={`Add ${product.name} (${product.unitLabel}) for ${formatCurrency(product.sellPrice)} to cart`}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[length:var(--font-size-caption)] font-medium transition-colors disabled:opacity-50 ${
                        isOutOfStock
                          ? "border border-danger/40 bg-danger/5 text-danger hover:bg-danger/10"
                          : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      }`}
                    >
                      {product.unitLabel} · {formatCurrency(product.sellPrice)}
                    </RippleButton>
                  )}

                  {/* Alt unit — inline stepper if already in cart */}
                  {altQty > 0 ? (
                    <InlineStepper
                      qty={altQty}
                      label={`${product.name} (${product.altUnitLabel})`}
                      onDecrement={() => onDecrementLine(altKey!)}
                      onIncrement={() => onIncrementLine(altKey!)}
                      disabled={hasNoBranches}
                    />
                  ) : (
                    <RippleButton
                      type="button"
                      onClick={() =>
                        isOutOfStock || stock < (product.altUnitConversionFactor ?? 1)
                          ? showToast(
                              `Not enough stock for a ${product.altUnitLabel}: only ${stock} in stock.`,
                              "warning",
                              {
                                label: "Restock",
                                onClick: () => router.push("/purchases/new"),
                              }
                            )
                          : handleFreshAdd(
                              product.id,
                              product.altUnitSellPrice!,
                              product.altUnitLabel!,
                              product.altUnitConversionFactor!
                            )
                      }
                      disabled={hasNoBranches}
                      aria-label={`Add ${product.name} (${product.altUnitLabel}) for ${formatCurrency(product.altUnitSellPrice)} to cart`}
                      className="shrink-0 rounded-full bg-surface-container px-3 py-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                    >
                      {product.altUnitLabel} · {formatCurrency(product.altUnitSellPrice)}
                    </RippleButton>
                  )}
                </div>
              ) : (
                /* Single-unit row: tap-to-add OR inline stepper when in cart */
                baseQty > 0 ? (
                  <div
                    id={idx === 0 ? "tour-pos-item" : undefined}
                    className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-brand-accent/40 bg-brand-accent/5 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                      {product.name}
                    </span>
                    <InlineStepper
                      qty={baseQty}
                      label={product.name}
                      onDecrement={() => onDecrementLine(baseKey)}
                      onIncrement={() => onIncrementLine(baseKey)}
                      disabled={hasNoBranches}
                    />
                  </div>
                ) : (
                  <RippleButton
                    id={idx === 0 ? "tour-pos-item" : undefined}
                    type="button"
                    onClick={() =>
                      isOutOfStock
                        ? handleOutOfStockAttempt(product)
                        : handleFreshAdd(product.id, product.sellPrice, product.unitLabel, 1)
                    }
                    disabled={hasNoBranches}
                    aria-label={`Add ${product.name} for ${formatCurrency(product.sellPrice)} to cart`}
                    className={`flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-left disabled:opacity-50 ${
                      isOutOfStock ? "border-danger/30 bg-danger/5" : "border-border"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                        {product.name}
                      </span>
                      {isOutOfStock ? (
                        <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          Out of stock
                        </span>
                      ) : isLowStock ? (
                        <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                          {stock} left
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                      {formatCurrency(product.sellPrice)}
                    </span>
                  </RippleButton>
                )
              )}
            </li>
            );
          })}
        </ul>
          {filteredProducts.length > visibleLimit && (
            <div ref={loadMoreRef} className="py-4 text-center text-sm text-on-surface-muted">
              Loading more...
            </div>
          )}
        </div>
      )}

      {itemCount > 0 && (
        <div className="sticky bottom-0 -mx-5 flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-3 shadow-[var(--shadow-elevation-2)] animate-step-in">
          <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
            {itemCount} item{itemCount === 1 ? "" : "s"} · <span className="font-number font-semibold tabular-nums">{formatCurrency(total)}</span>
          </span>
          <RippleButton
            id="tour-pos-cart"
            type="button"
            onClick={onReviewCart}
            className="flex min-h-[var(--touch-target-min)] items-center shrink-0 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
          >
            Review cart →
          </RippleButton>
        </div>
      )}
    </div>
  );
}

/**
 * Inline quantity stepper — rendered directly on the Browse product row
 * when that product is already in the cart (qty ≥ 1). Avoids any navigation
 * to CartStep just to bump a quantity. H7: efficiency for expert users.
 */
function InlineStepper({
  qty,
  label,
  onDecrement,
  onIncrement,
  disabled,
}: {
  qty: number;
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={`Decrease ${label} quantity`}
        className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full border border-border bg-surface text-on-surface font-semibold text-[length:var(--font-size-title)] hover:bg-surface-container-high transition-colors disabled:opacity-50"
      >
        −
      </button>
      <span
        className="w-6 text-center font-number font-semibold tabular-nums text-[length:var(--font-size-body)] text-brand-accent"
        aria-live="polite"
        aria-label={`${label} quantity: ${qty}`}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={disabled}
        aria-label={`Increase ${label} quantity`}
        className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full bg-brand-accent text-brand-accent-contrast font-semibold text-[length:var(--font-size-title)] hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        +
      </button>
    </div>
  );
}
