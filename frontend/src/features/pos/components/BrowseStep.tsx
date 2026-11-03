import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Camera, PauseCircle, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { feedbackAddToCart, feedbackScanSuccess, feedbackError } from "@/lib/feedback";

// Loaded on demand — @zxing/library is a non-trivial decode library only
// actually needed once the camera icon is tapped, but was previously
// statically imported into this screen's initial bundle regardless.
const BarcodeScanner = dynamic(() => import("@/components/ui/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});
import { NoResultsState } from "@/components/ui/NoResultsState";
import { RippleButton } from "@/components/ui/Ripple";
import { SearchBar } from "@/components/ui/SearchBar";
import { formatCurrency } from "@/lib/format";
import { getRecentCategoryIds, markCategoryUsed } from "@/lib/last-used-category";
import { cartLineKey } from "@/features/pos/use-cart";
import { resolveStockStatus } from "@/features/inventory/product-insights";
import { parsePosQuery } from "@/lib/parse-pos-query";
import type { CartLine } from "@/features/pos/complete-sale";
import type { Product } from "@/types/product";
import type { LocalCategory } from "@/lib/db";
import { useNavigation } from "@/components/ui/NavigationContext";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";

export function BrowseStep(props: {
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
  onClearCart?: () => void;
  onGoToSettings: () => void;
  stockByProduct?: Record<string, number>;
  parkedSalesCount?: number;
  onOpenParkedSales?: () => void;
}) {
  const {
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
    onClearCart,
    stockByProduct,
    parkedSalesCount = 0,
    onOpenParkedSales,
  } = props;

  const router = useRouter();
  const { showToast } = useToast();
  const { setSearchActive } = useNavigation();
  const isKeyboardOpen = useKeyboardOpen();
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (query.trim().length > 0) {
      setSearchActive(true);
    }
  }, [query, setSearchActive]);

  function handleOutOfStockAttempt(product: Product) {
    feedbackError();
    showToast(`Out of stock: "${product.name}" has 0 on shelf.`, "danger", {
      label: "Restock",
      onClick: () => router.push("/purchases/new"),
    });
  }

  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [prevProductsLength, setPrevProductsLength] = useState(0);
  const [prevCategoryId, setPrevCategoryId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedProductIds, setScannedProductIds] = useState<string[]>([]);

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
      const reset = window.setTimeout(() => {
        setPrevProductsLength(filteredProducts.length);
        setPrevCategoryId(selectedCategoryId);
        setVisibleLimit(50);
      }, 0);
      return () => window.clearTimeout(reset);
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
   * The query intentionally remains visible after an add. This keeps the
   * result set stable for quantity adjustments and lets a cashier choose a
   * second matching result without losing context. Selection buttons do not
   * programmatically focus the input, so mobile keyboards do not reopen.
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

      <div className="sticky top-0 z-20 -mx-gutter sm:-mx-gutter-lg mb-1 bg-surface px-gutter sm:px-gutter-lg pb-3 pt-1">
        <div className="flex items-center gap-2">
          <div className="flex h-12 items-stretch gap-2 flex-1 min-w-0">
            <div className="h-12 min-w-0 flex-1">
              <SearchBar
                value={query}
                onChange={(val) => {
                  onQueryChange(val);
                  setSearchActive(Boolean(val.trim()));
                }}
                onFocus={() => setSearchActive(true)}
                onBlur={() => {
                  if (!query.trim()) setSearchActive(false);
                }}
                onKeyDown={(e) => {
                  // Enter → immediately add the first visible single-unit result.
                  // Dual-unit products are skipped: the cashier must still pick
                  // a unit, so Enter would guess wrong. H7: expert accelerator.
                  if (e.key === "Enter" && filteredProducts.length > 0) {
                    const first = filteredProducts[0];
                    if (!first.altUnitLabel) {
                      const { qty } = parsePosQuery(query);
                      handleFreshAdd(first.id, first.sellPrice, first.unitLabel, 1, qty);
                      e.preventDefault();
                    }
                  }
                }}
                placeholder="Search shop..."
                ariaLabel="Search products"
                shape="standalone"
              />
            </div>
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label="Scan barcode"
              title="Scan barcode"
              className="flex h-12 w-12 min-h-12 min-w-12 self-stretch shrink-0 touch-manipulation items-center justify-center rounded-[var(--radius-control)] bg-brand-container text-on-brand-container hover:bg-brand-container/80 active:scale-95 transition-all duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
            >
              <Camera size={19} aria-hidden />
            </button>
          </div>

          {parkedSalesCount > 0 && (
            <button
              type="button"
              onClick={onOpenParkedSales}
              aria-label={`Open ${parkedSalesCount} held sale${parkedSalesCount === 1 ? "" : "s"}`}
              title="Open held sales"
              className="flex h-12 min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-surface-container-high px-3 text-xs font-semibold tabular-nums text-on-surface transition-all hover:bg-surface-container-highest active:scale-95 touch-manipulation sm:min-w-0"
            >
              <PauseCircle size={16} strokeWidth={2.2} className="text-brand-accent" aria-hidden />
              <span className="hidden sm:inline">Held</span>
              <span className="font-bold">{parkedSalesCount}</span>
            </button>
          )}
        </div>
      </div>

      {scanning && (
        <BarcodeScanner
          backLabel="Back to sale"
          onResult={(res) => {
            const match = allProducts.find((p) => p.barcode === res);
            if (match) {
              feedbackScanSuccess();
              const baseKey = cartLineKey(match.id, match.unitLabel);
              const currentQty = cart[baseKey]?.quantity ?? 0;
              if (currentQty === 0) {
                handleFreshAdd(match.id, match.sellPrice, match.unitLabel, 1);
              } else {
                onIncrementLine(baseKey);
              }
              setScannedProductIds((prev) => [match.id, ...prev.filter((id) => id !== match.id)]);
              showToast(`Scanned: ${match.name}`, "success");
            } else {
              feedbackError();
              showToast(`No product with barcode "${res}"`, "warning");
            }
          }}
          onCancel={() => setScanning(false)}
          bottomBar={
            <div className="flex items-center justify-between gap-3 max-w-xl mx-auto w-full">
              <div className="min-w-0">
                <p className="text-xs text-on-surface-muted truncate">
                  {itemCount} {itemCount === 1 ? "item" : "items"} in cart
                </p>
                <p className="font-number font-bold text-base text-on-surface truncate tabular-nums">
                  {formatCurrency(total)}
                </p>
              </div>
              <RippleButton
                type="button"
                onClick={() => setScanning(false)}
                className="shrink-0 rounded-2xl bg-brand-accent px-5 py-2.5 text-xs font-semibold text-brand-accent-contrast shadow-sm hover:brightness-105 active:scale-95 transition-all"
              >
                Done / Return to POS
              </RippleButton>
            </div>
          }
        >
          {scannedProductIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-brand-container/40 text-brand-accent flex items-center justify-center mb-3">
                <Camera size={24} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-on-surface">Ready to scan items</p>
              <p className="text-xs text-on-surface-muted mt-1 max-w-xs">
                Hold barcode in the camera view above. Scanned items appear here with instant + and − buttons.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[length:var(--font-size-caption)] font-semibold uppercase tracking-wider text-on-surface-muted">
                  Scanned Products ({scannedProductIds.length})
                </h3>
                <span className="text-[length:var(--font-size-caption)] text-brand-accent font-medium">
                  Tap + to bump quantity fast
                </span>
              </div>
              {scannedProductIds.map((id) => {
                const product = allProducts.find((p) => p.id === id);
                if (!product) return null;
                const baseKey = cartLineKey(product.id, product.unitLabel);
                const qty = cart[baseKey]?.quantity ?? 0;
                const stock = stockByProduct?.[product.id];
                const canAdd = stock === undefined || qty + 1 <= stock;

                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container p-3 border border-border/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-on-surface truncate">{product.name}</p>
                      <p className="text-xs font-number font-semibold text-brand-accent mt-0.5 tabular-nums">
                        {formatCurrency(product.sellPrice)} <span className="text-on-surface-muted font-sans font-normal">/ {product.unitLabel}</span>
                      </p>
                    </div>

                    <InlineStepper
                      qty={qty}
                      label={product.name}
                      onDecrement={() => onDecrementLine(baseKey)}
                      onIncrement={() => onIncrementLine(baseKey)}
                      incrementDisabled={!canAdd}
                      onIncrementBlocked={() =>
                        showToast(`Only ${stock} of "${product.name}" in stock.`, "warning")
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </BarcodeScanner>
      )}

      {/* Category filter chips */}
      {categories && categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className={`min-h-[38px] shrink-0 rounded-full px-4 text-xs font-medium transition-all flex items-center touch-manipulation active:scale-95 select-none ${
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
              className={`min-h-[38px] shrink-0 rounded-full px-4 text-xs font-medium transition-all flex items-center touch-manipulation active:scale-95 select-none ${
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
              const status = resolveStockStatus(
                stockByProduct?.[product.id],
                product.lowStockThreshold
              );
              const isStockResolved = stockByProduct !== undefined;
              const isOutOfStock = isStockResolved && status === "out";
              return (
                <li key={product.id} className="shrink-0">
                  <RippleButton
                    type="button"
                    onClick={() =>
                      isOutOfStock
                        ? handleOutOfStockAttempt(product)
                        : handleBestSellerAdd(product)
                    }
                    aria-label={`Add ${product.name} (${product.unitLabel}) for ${formatCurrency(product.sellPrice)} to cart`}
                    className={`flex w-36 min-h-[58px] flex-col items-start gap-1 rounded-[var(--radius-card)] px-3 py-2.5 text-left transition-all active:scale-[0.97] touch-manipulation select-none disabled:opacity-50 ${
                      isOutOfStock ? "bg-danger-container text-on-danger-container" : "bg-surface-container hover:bg-surface-container-high"
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
                          className="animate-count-pop rounded-full bg-brand-container px-1.5 py-0.5 font-number text-[length:var(--font-size-caption)] font-semibold tabular-nums text-on-brand-container"
                          aria-label={`${baseQty} in cart`}
                        >
                          ×{baseQty}
                        </span>
                      )}
                      {isOutOfStock && (
                        <span className="rounded-full bg-danger-container px-1.5 py-0.5 text-[length:var(--font-size-caption)] font-semibold text-on-danger-container">
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
        <NoResultsState
          query={query}
          entityLabel="products"
          onClear={() => onQueryChange("")}
        />
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {filteredProducts.slice(0, visibleLimit).map((product, idx) => {
            const baseKey = cartLineKey(product.id, product.unitLabel);
            const baseQty = cart[baseKey]?.quantity ?? 0;
            const altKey = product.altUnitLabel ? cartLineKey(product.id, product.altUnitLabel) : null;
            const altQty = altKey ? (cart[altKey]?.quantity ?? 0) : 0;
            const isStockResolved = stockByProduct !== undefined;
            const stock = stockByProduct?.[product.id];
            const status = resolveStockStatus(stock, product.lowStockThreshold);
            const isOutOfStock = isStockResolved && status === "out";
            const isLowStock = isStockResolved && status === "low";
            const isUntracked = isStockResolved && status === "untracked";

            const altFactor = product.altUnitConversionFactor ?? 1;
            const currentTotalBaseUnits = baseQty * 1 + altQty * altFactor;
            const canAddBase = !isStockResolved
              ? false
              : stock === undefined
                ? true
                : currentTotalBaseUnits + 1 <= stock;
            const canAddAlt = !isStockResolved
              ? false
              : stock === undefined
                ? true
                : currentTotalBaseUnits + altFactor <= stock;

            return (
            <li key={product.id}>
              {product.altUnitLabel && product.altUnitConversionFactor && product.altUnitSellPrice !== null ? (
                /* Dual-unit (wholesale) card: Product name and stock on top, wholesale unit buttons placed underneath */
                <div
                  id={idx === 0 ? "tour-pos-item" : undefined}
                  className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-surface-container-high px-4 py-3 transition-colors"
                >
                  {/* Top row: full-width product name and stock status */}
                  <div className="flex items-start justify-between gap-2 w-full min-w-0">
                    <span className="text-[length:var(--font-size-body-lg)] font-medium text-on-surface leading-snug break-words">
                      {product.name}
                    </span>
                    <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                      {isOutOfStock ? (
                        <span className="shrink-0 rounded-full bg-danger-container/80 text-on-danger-container px-2 py-0.5 text-[11px] font-semibold border border-danger/25">
                          Out of stock
                        </span>
                      ) : isLowStock ? (
                        <span className="shrink-0 rounded-full bg-warning-container/80 text-on-warning-container px-2 py-0.5 text-[11px] font-semibold tabular-nums font-number border border-warning/25">
                          Low · {stock} left
                        </span>
                      ) : isUntracked ? (
                        <span className="shrink-0 text-[11px] text-on-surface-muted">
                          Not tracked
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-on-surface-muted font-number tabular-nums">
                          {stock} on shelf
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom row: wholesale unit buttons placed underneath, smaller in height */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    {/* Base unit — inline stepper if already in cart */}
                    {baseQty > 0 ? (
                      <InlineStepper
                        qty={baseQty}
                        label={`${product.name} (${product.unitLabel})`}
                        onDecrement={() => onDecrementLine(baseKey)}
                        onIncrement={() => onIncrementLine(baseKey)}
                        incrementDisabled={!canAddBase}
                        size="sm"
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
                        aria-label={`Add ${product.name} (${product.unitLabel}) for ${formatCurrency(product.sellPrice)} to cart`}
                        className={`shrink-0 min-h-[34px] sm:min-h-[36px] rounded-full px-3 py-1 text-xs font-semibold transition-all active:scale-95 touch-manipulation select-none disabled:opacity-50 flex items-center gap-1.5 border border-border/60 ${
                          isOutOfStock
                            ? "border-danger/40 bg-danger/5 text-danger hover:bg-danger/10"
                            : "bg-surface-container text-on-surface hover:bg-surface-container-highest"
                        }`}
                      >
                        <span className="font-medium">{product.unitLabel}</span>
                        <span className="text-on-surface-muted/60">·</span>
                        <span className="font-number tabular-nums font-bold">{formatCurrency(product.sellPrice)}</span>
                      </RippleButton>
                    )}

                    {/* Alt unit — inline stepper if already in cart */}
                    {altQty > 0 ? (
                      <InlineStepper
                        qty={altQty}
                        label={`${product.name} (${product.altUnitLabel})`}
                        onDecrement={() => onDecrementLine(altKey!)}
                        onIncrement={() => onIncrementLine(altKey!)}
                        incrementDisabled={!canAddAlt}
                        size="sm"
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
                          isOutOfStock || (stock !== undefined && stock < (product.altUnitConversionFactor ?? 1))
                            ? showToast(
                                `Not enough stock for a ${product.altUnitLabel}: only ${stock ?? 0} in stock.`,
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
                        aria-label={`Add ${product.name} (${product.altUnitLabel}) for ${formatCurrency(product.altUnitSellPrice)} to cart`}
                        className="shrink-0 min-h-[34px] sm:min-h-[36px] rounded-full bg-surface-container border border-border/60 px-3 py-1 text-xs font-semibold text-on-surface transition-all active:scale-95 touch-manipulation select-none hover:bg-surface-container-highest disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <span className="font-medium">{product.altUnitLabel} ({product.altUnitConversionFactor})</span>
                        <span className="text-on-surface-muted/60">·</span>
                        <span className="font-number tabular-nums font-bold">{formatCurrency(product.altUnitSellPrice)}</span>
                      </RippleButton>
                    )}
                  </div>
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
                    aria-label={`Add ${product.name} for ${formatCurrency(product.sellPrice)} to cart`}
                    className={`flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] px-4 py-3 text-left transition-all active:scale-[0.98] touch-manipulation select-none disabled:opacity-50 ${
                      isOutOfStock ? "bg-danger-container text-on-danger-container" : "bg-surface-container-high hover:bg-surface-container-highest"
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                        {product.name}
                      </span>
                      {isOutOfStock ? (
                        <span className="shrink-0 rounded-full bg-danger-container px-2 py-0.5 text-xs font-semibold text-on-danger-container">
                          Out of stock
                        </span>
                      ) : isLowStock ? (
                        <span className="shrink-0 rounded-full bg-warning-container px-2 py-0.5 text-xs font-semibold tabular-nums font-number text-on-warning-container">
                          {stock} left
                        </span>
                      ) : isUntracked ? (
                        <span className="shrink-0 text-xs text-on-surface-muted">
                          Not tracked
                        </span>
                      ) : null}
                    </div>
                    <span className={`shrink-0 font-number text-[length:var(--font-size-body)] font-bold tabular-nums ${isOutOfStock ? "text-on-surface-muted line-through" : "text-on-surface"}`}>
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
        <div
          className={`sticky bottom-0 z-30 mt-auto -mx-gutter sm:-mx-gutter-lg items-center justify-between gap-2.5 cta-scrim-container px-gutter sm:px-gutter-lg pt-2 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] transition-all duration-200 animate-step-in ${
            isKeyboardOpen ? "hidden pointer-events-none" : "flex"
          }`}
        >
          {onClearCart && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              aria-label="Cancel and clear all selected items"
              title="Cancel sale"
              className="flex h-10 w-10 min-h-10 min-w-10 shrink-0 touch-manipulation items-center justify-center rounded-[var(--radius-control)] bg-danger-container text-on-danger-container transition-all hover:bg-danger-container/80 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}

          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <span className="truncate text-xs font-medium text-on-surface-muted">
              {itemCount} item{itemCount === 1 ? "" : "s"} selected
            </span>
            <span key={total} className="animate-count-pop font-number font-bold text-base tabular-nums text-on-surface">
              {formatCurrency(total)}
            </span>
          </div>

          <RippleButton
            id="tour-pos-cart"
            type="button"
            onClick={onReviewCart}
            className="flex min-h-[44px] sm:min-h-[48px] items-center shrink-0 rounded-[var(--radius-control)] bg-brand-accent px-4 sm:px-5 text-sm sm:text-[length:var(--font-size-body-lg)] font-bold text-brand-accent-contrast transition-all active:scale-[0.98] touch-manipulation hover:opacity-95 shadow-xs"
          >
            Review cart →
          </RippleButton>

          <ConfirmDialog
            isOpen={showClearConfirm}
            onClose={() => setShowClearConfirm(false)}
            onConfirm={() => {
              onClearCart?.();
              setShowClearConfirm(false);
              showToast("Selection cleared.", "neutral");
            }}
            title="Cancel current sale?"
            description="All selected items will be removed from this order."
            confirmLabel="Clear sale"
            variant="danger"
          />
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
  disabled = false,
  incrementDisabled = false,
  onIncrementBlocked,
  size = "default",
}: {
  qty: number;
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
  incrementDisabled?: boolean;
  onIncrementBlocked?: () => void;
  size?: "default" | "sm";
}) {
  const isSm = size === "sm";
  return (
    <div className={`flex items-center ${isSm ? "gap-1" : "gap-1.5"} shrink-0 select-none`}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={disabled}
        aria-label={`Decrease ${label} quantity`}
        className={`flex items-center justify-center rounded-full bg-surface-container text-on-surface font-bold transition-all active:scale-90 touch-manipulation hover:bg-surface-container-high disabled:opacity-50 ${
          isSm
            ? "h-8 w-8 min-h-[32px] min-w-[32px] text-base"
            : "h-[var(--touch-target-min)] w-[var(--touch-target-min)] min-h-[44px] min-w-[44px] text-[length:var(--font-size-title)]"
        }`}
      >
        −
      </button>
      <span
        key={qty}
        className={`animate-count-pop text-center font-number font-bold tabular-nums text-brand-accent select-none ${
          isSm ? "w-6 text-sm" : "w-7 text-[length:var(--font-size-body-lg)]"
        }`}
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
        className={`flex items-center justify-center rounded-full font-bold transition-all touch-manipulation ${
          isSm
            ? "h-8 w-8 min-h-[32px] min-w-[32px] text-base"
            : "h-[var(--touch-target-min)] w-[var(--touch-target-min)] min-h-[44px] min-w-[44px] text-[length:var(--font-size-title)]"
        } ${
          incrementDisabled
            ? "border border-border bg-surface-container text-on-surface-muted opacity-60 cursor-not-allowed"
            : "bg-brand-accent text-brand-accent-contrast hover:opacity-90 active:scale-90 shadow-2xs"
        }`}
      >
        +
      </button>
    </div>
  );
}
