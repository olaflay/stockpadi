import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Search, Camera } from "lucide-react";

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
  onAddToCart: (productId: string, unitPrice: number, unitLabel: string, conversionFactor: number) => void;
  itemCount: number;
  total: number;
  onReviewCart: () => void;
  onGoToSettings: () => void;
}) {
  const {
    hasNoBranches,
    query,
    onQueryChange,
    categories,
    selectedCategoryId,
    onSelectCategory,
    filteredProducts,
    onAddToCart,
    itemCount,
    total,
    onReviewCart,
    onGoToSettings,
  } = props;

  const [visibleLimit, setVisibleLimit] = useState(50);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

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
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            disabled={hasNoBranches}
            placeholder={hasNoBranches ? "Configure branch in settings to search" : "Search products"}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface disabled:opacity-50"
          />
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
            onQueryChange(res);
            setScanning(false);
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
            {filteredProducts.slice(0, visibleLimit).map((product, idx) => (
            <li key={product.id}>
              {product.altUnitLabel && product.altUnitConversionFactor && product.altUnitSellPrice !== null ? (
                <div
                  id={idx === 0 ? "tour-pos-item" : undefined}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center gap-2 rounded-[var(--radius-card)] border border-border px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                    {product.name}
                  </span>
                  <RippleButton
                    type="button"
                    onClick={() => onAddToCart(product.id, product.sellPrice, product.unitLabel, 1)}
                    disabled={hasNoBranches}
                    className="shrink-0 rounded-full bg-surface-container px-3 py-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                  >
                    {product.unitLabel} · {formatCurrency(product.sellPrice)}
                  </RippleButton>
                  <RippleButton
                    type="button"
                    onClick={() =>
                      onAddToCart(
                        product.id,
                        product.altUnitSellPrice!,
                        product.altUnitLabel!,
                        product.altUnitConversionFactor!
                      )
                    }
                    disabled={hasNoBranches}
                    className="shrink-0 rounded-full bg-surface-container px-3 py-1.5 text-[length:var(--font-size-caption)] font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50"
                  >
                    {product.altUnitLabel} · {formatCurrency(product.altUnitSellPrice)}
                  </RippleButton>
                </div>
              ) : (
                <RippleButton
                  id={idx === 0 ? "tour-pos-item" : undefined}
                  type="button"
                  onClick={() => onAddToCart(product.id, product.sellPrice, product.unitLabel, 1)}
                  disabled={hasNoBranches}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border px-4 py-3 text-left disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate text-[length:var(--font-size-body-lg)] text-on-surface">
                    {product.name}
                  </span>
                  <span className="shrink-0 text-[length:var(--font-size-body)] font-medium text-on-surface">
                    {formatCurrency(product.sellPrice)}
                  </span>
                </RippleButton>
              )}
            </li>
          ))}
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
            {itemCount} item{itemCount === 1 ? "" : "s"} · {formatCurrency(total)}
          </span>
          <RippleButton
            id="tour-pos-cart"
            type="button"
            onClick={onReviewCart}
            className="min-h-[var(--touch-target-min)] shrink-0 rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
          >
            Review cart →
          </RippleButton>
        </div>
      )}
    </div>
  );
}
