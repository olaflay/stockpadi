import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Camera, GitBranch, Plus } from "lucide-react";
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
  bestSellerIds?: Set<string>;
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
    bestSellerIds,
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

  // Best-seller products in rank order (Set insertion order is the rank).
  // Only shown when browsing the full catalog — never during a search or
  // while a category filter is active, so the strip never competes with
  // the query the cashier is actively working.
  const bestSellerProducts = bestSellerIds
    ? Array.from(bestSellerIds)
        .map((id) => allProducts.find((p) => p.id === id))
        .filter((p: Product | undefined): p is Product => p != null && !p.archived)
    : [];

  // Reset visible limit when products or category changes
  useEffect(() => {
    if (filteredProducts.length !== prevProductsLength || selectedCategoryId !== prevCategoryId) {
      setPrevProductsLength(filteredProducts.length);
      setPrevCategoryId(selectedCategoryId);
      setVisibleLimit(50);
    }
  }, [filteredProducts.length, selectedCategoryId, prevProductsLength, prevCategoryId]);

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

  /**
   * Add from the Best-sellers strip: same cart add and feedback as a fresh
   * add, but never clears the (already empty) query or re-focuses the search
   * input. Tapping through frequent items shouldn't pop the keyboard open
   * between every tap. One tap per unit, stepper-free.
   */
  function handleBestSellerAdd(product: Product) {
    feedbackAddToCart();
    onAddToCart(product.id, product.sellPrice, product.unitLabel, 1);
  }

  return (
    <div key="browse" className="flex flex-col gap-4 animate-step-in">
      <h1 className="sr-only">Sell</h1>

      {hasNoBranches && (
        <div className="flex flex-col gap-3 rounded-2xl bg-warning-container border border-warning/30 p-4 text-on-warning-container shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
              <GitBranch size={20} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base text-on-warning-container">Create a branch to start selling</h3>
              <p className="text-xs sm:text-sm text-on-warning-container/90 mt-0.5">
                Every sale and stock movement belongs to a branch. Create your first branch to unlock selling and inventory sync.
              </p>
            </div>
          </div>
          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={onGoToSettings}
              className="min-h-[var(--touch-target-min)] inline-flex items-center justify-center gap-2 rounded-xl bg-warning px-4 py-2.5 text-on-warning font-semibold text-sm hover:opacity-95 active:scale-[0.98] transition-all shadow-xs"
            >
              <Plus size={16} aria-hidden />
              <span>Create Branch</span>
            </button>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-gutter sm:-mx-gutter-lg mb-1 bg-surface px-gutter sm:px-gutter-lg pb-3 pt-1">
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
              placeholder={hasNoBranches ? "Configure branch in settings to search" : "Search shop..."}
              className={`min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-surface-container-low pl-10 text-center placeholder:text-center focus:text-left focus:placeholder:text-left text-[length:var(--font-size-body)] text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20 transition-all disabled:opacity-50 ${
                itemCount > 0 ? "pr-16" : "pr-10"
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
            className="flex min-h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-surface-container-low text-on-surface hover:bg-surface-container disabled:opacity-50 transition-colors"
          >
            <Camera size={18} aria-hidden />
          </button>
        </div>
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
            className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors flex items-center ${
              selectedCategoryId === null
                ? "bg-brand-accent text-brand-accent-contrast font-semibold"
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
              className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition-colors flex items-center ${
                selectedCategoryId === cat.id
                  ? "bg-brand-accent text-brand-accent-contrast font-semibold"
                  : "bg-surface-container hover:bg-surface-container-high text-on-surface"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Best sellers — quick-add strip shown only on the untouched catalog
          (no query, no category filter). DoorDash "Buy it again" / Gopuff
          pattern: the items a cashier rings up most, one tap per unit, no
          search needed for the frequencies they actually sell. */}
      {query === "" && selectedCategoryId === null && bestSellerProducts.length > 0 && (
        <div>
          <h2 className="mb-2 text-[length:var(--font-size-caption)] font-semibold uppercase tracking-wide text-on-surface-muted">
            Best sellers
          </h2>
          <ul className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {bestSellerProducts.map((product) => {
              const baseKey = cartLineKey(product.id, product.unitLabel);
              const baseQty = cart[baseKey]?.quantity ?? 0;
              const stock = stockByProduct?.[product.id] ?? 0;
              const isStockTracked = stockByProduct !== undefined;
              const isOutOfStock = isStockTracked && stock <= 0;
              return (
                <li key={product.id} className="shrink-0">
                  <RippleButton
                    type="button"
                    onClick={() =>
                      isOutOfStock
                        ? handleOutOfStockAttempt(product)
                        : handleBestSellerAdd(product)
                    }
                    disabled={hasNoBranches}
                    aria-label={`Add ${product.name} (${product.unitLabel}) for ${formatCurrency(product.sellPrice)} to cart`}
                    className={`flex w-36 flex-col items-start gap-1 rounded-[var(--radius-card)] px-3 py-2.5 text-left transition-[background-color,transform] active:scale-[0.98] disabled:opacity-50 ${
                      isOutOfStock ? "bg-danger/10" : "bg-surface-container-low"
                    }`}
                  >
                    <span className="w-full truncate text-[length:var(--font-size-body)] font-medium text-on-surface">
                      {product.name}
                    </span>
                    <span className="flex w-full items-center justify-between gap-1">
                      <span
                        className={`font-number text-[length:var(--font-size-body)] font-medium tabular-nums ${
                          isOutOfStock ? "text-on-surface-muted line-through" : "text-brand-accent"
                        }`}
                      >
                        {formatCurrency(product.sellPrice)}
                      </span>
                      {baseQty > 0 && (
<span
                        key={baseQty}
                        className="animate-count-pop rounded-full bg-brand-accent/15 px-1.5 py-0.5 font-number text-[length:var(--font-size-caption)] font-semibold tabular-nums text-brand-accent"
                        aria-label={`${baseQty} in cart`}
                      >
                          ×{baseQty}
                        </span>
                      )}
                      {isOutOfStock && (
                        <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[length:var(--font-size-caption)] font-semibold text-danger">
                          Out
                        </span>
                      )}
                    </span>
                  </RippleButton>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <NoResultsState query={query} onClear={() => onQueryChange("")} />
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {filteredProducts.slice(0, visibleLimit).map((product, idx) => {
            const baseKey = cartLineKey(product.id, product.unitLabel);
            const baseQty = cart[baseKey]?.quantity ?? 0;
            const altKey = product.altUnitLabel ? cartLineKey(product.id, product.altUnitLabel) : null;
            const altQty = altKey ? (cart[altKey]?.quantity ?? 0) : 0;
            const stock = stockByProduct?.[product.id] ?? 0;
            const isStockTracked = stockByProduct !== undefined;
            const isOutOfStock = isStockTracked && stock <= 0;
            const isLowStock = !isOutOfStock && isStockTracked && stock <= (product.lowStockThreshold ?? 5);

            const altFactor = product.altUnitConversionFactor ?? 1;
            const currentTotalBaseUnits = baseQty * 1 + altQty * altFactor;
            const canAddBase = !isStockTracked || currentTotalBaseUnits + 1 <= stock;
            const canAddAlt = !isStockTracked || currentTotalBaseUnits + altFactor <= stock;

            return (
            <li key={product.id}>
              {product.altUnitLabel && product.altUnitConversionFactor && product.altUnitSellPrice !== null ? (
                /* Dual-unit row: base unit pill + alt unit pill */
                <div
                  id={idx === 0 ? "tour-pos-item" : undefined}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center gap-2 rounded-[var(--radius-card)] bg-surface-container-low px-4 py-3"
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
                      incrementDisabled={!canAddBase}
                      onIncrementBlocked={() =>
                        showToast(
                          `Only ${stock} of "${product.name}" available in stock.`,
                          "warning",
                          {
                            label: "Restock",
                            onClick: () => router.push("/purchases/new"),
                          }
                        )
                      }
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
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[length:var(--font-size-caption)] font-medium transition-[background-color,transform] active:scale-[0.98] disabled:opacity-50 ${
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
                      incrementDisabled={!canAddAlt}
                      onIncrementBlocked={() =>
                        showToast(
                          `Only ${stock} left. Needs ${altFactor} for another ${product.altUnitLabel}.`,
                          "warning",
                          {
                            label: "Restock",
                            onClick: () => router.push("/purchases/new"),
                          }
                        )
                      }
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
                      className="shrink-0 rounded-full bg-surface-container px-3 py-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface transition-[background-color,transform] active:scale-[0.98] hover:bg-surface-container-high disabled:opacity-50"
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
                      incrementDisabled={!canAddBase}
                      onIncrementBlocked={() =>
                        showToast(
                          `Cannot add more: only ${stock} of "${product.name}" in stock.`,
                          "warning",
                          {
                            label: "Restock",
                            onClick: () => router.push("/purchases/new"),
                          }
                        )
                      }
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
                    className={`flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-3 text-left transition-[background-color,transform] active:scale-[0.98] disabled:opacity-50 ${
                      isOutOfStock ? "bg-danger/10" : "bg-surface-container-low"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                        {product.name}
                      </span>
                      {isOutOfStock ? (
                        <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
                          Out of stock
                        </span>
                      ) : isLowStock ? (
                        <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
                          {stock} left
                        </span>
                      ) : null}
                    </div>
                    <span className={`shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums ${isOutOfStock ? "text-on-surface-muted line-through" : "text-on-surface"}`}>
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
        <div className="sticky bottom-0 -mx-gutter sm:-mx-gutter-lg flex items-center justify-between gap-3 bg-surface/95 backdrop-blur-md px-gutter sm:px-gutter-lg py-3 shadow-[var(--shadow-elevation-2)] animate-step-in">
          <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">
            {itemCount} item{itemCount === 1 ? "" : "s"} · <span key={total} className="animate-count-pop font-number font-semibold tabular-nums">{formatCurrency(total)}</span>
          </span>
          <RippleButton
            id="tour-pos-cart"
            type="button"
            onClick={onReviewCart}
            className="flex min-h-[var(--touch-target-min)] items-center shrink-0 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast transition-[opacity,transform] active:scale-[0.98] hover:opacity-95"
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
  incrementDisabled = false,
  onIncrementBlocked,
}: {
  qty: number;
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled: boolean;
  incrementDisabled?: boolean;
  onIncrementBlocked?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={`Decrease ${label} quantity`}
        className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full bg-surface-container text-on-surface font-semibold text-[length:var(--font-size-title)] transition-[background-color,transform] active:scale-95 hover:bg-surface-container-high disabled:opacity-50"
      >
        −
      </button>
      <span
        key={qty}
        className="animate-count-pop w-6 text-center font-number font-semibold tabular-nums text-[length:var(--font-size-body)] text-brand-accent"
        aria-live="polite"
        aria-label={`${label} quantity: ${qty}`}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={() => {
          if (incrementDisabled) {
            onIncrementBlocked?.();
          } else {
            onIncrement();
          }
        }}
        disabled={disabled}
        aria-label={`Increase ${label} quantity`}
        className={`flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-full font-semibold text-[length:var(--font-size-title)] transition-all ${
          incrementDisabled
            ? "border border-border bg-surface-container text-on-surface-muted opacity-60 cursor-not-allowed"
            : "bg-brand-accent text-brand-accent-contrast hover:opacity-90 active:scale-95"
        }`}
      >
        +
      </button>
    </div>
  );
}
