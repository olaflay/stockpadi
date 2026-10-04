"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import { Plus, Search, Package, Truck, Upload, Camera, MoreVertical, Archive, RotateCcw, X } from "lucide-react";

const BarcodeScanner = dynamic(() => import("@/components/ui/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});

import { db } from "@/lib/db";
import type { Product } from "@/types/product";
import { getLowStockProductIds, getBestSellingProductIds, getExpiringProductIds, getStockByProduct, resolveStockStatus, stockStatusLabel, LOW_STOCK_THRESHOLD } from "@/features/inventory/product-insights";
import { EmptyShelfIllustration } from "@/components/illustrations";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleLink } from "@/components/ui/Ripple";
import { RippleButton } from "@/components/ui/Ripple";
import { FAB } from "@/components/ui/FAB";
import { SearchBar } from "@/components/ui/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { useNavigation } from "@/components/ui/NavigationContext";
import { writeProductEditOffline } from "@/features/inventory/product-offline-write";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { tenantArray } from "@/lib/local-tenant";
import { PRODUCT_CAP } from "@/config/limits";
import { searchProductsFuzzy } from "@/lib/fuzzy-search";

type ProductFilter = "all" | "low-stock" | "best-sellers" | "expiring" | "archived";

const FILTER_LABELS: Record<ProductFilter, string> = {
  all: "All",
  "low-stock": "Low stock",
  "best-sellers": "Fast sellers",
  expiring: "Expiring",
  archived: "Archived",
};

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const { setSearchActive } = useNavigation();

  useEffect(() => {
    if (query.trim().length > 0) {
      setSearchActive(true);
    }
  }, [query, setSearchActive]);

  const filterParam = searchParams.get("filter");
  const [filter, setFilter] = useState<ProductFilter>(
    filterParam !== null && filterParam in FILTER_LABELS ? (filterParam as ProductFilter) : "all"
  );
  const user = useCurrentUser();
  const canViewProducts = hasCapability(user, "VIEW_PRODUCTS");
  const canEditProducts = hasCapability(user, "MANAGE_PRODUCTS");
  const stockBranchScope = user.accountType === "WORKER" ? (user.branchIds ?? []) : null;
  const stockBranchKey = stockBranchScope?.join(",") ?? "all";
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [prevQuery, setPrevQuery] = useState("");
  const [prevFilter, setPrevFilter] = useState<ProductFilter>("all");
  const [scanning, setScanning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();
  const categories = useLiveQuery(() => tenantArray(db.categories), [], []);

  const debouncedQuery = useDebounce(query, 120);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
  }, []);

  // Reset visible limit when query or filter changes
  useEffect(() => {
    if (debouncedQuery !== prevQuery || filter !== prevFilter) {
      const reset = window.setTimeout(() => {
        setPrevQuery(debouncedQuery);
        setPrevFilter(filter);
        setVisibleLimit(50);
      }, 0);
      return () => window.clearTimeout(reset);
    }
  }, [debouncedQuery, filter, prevQuery, prevFilter]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleArchiveSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const restoring = filter === "archived";
    const action = restoring ? "Restore" : "Archive";
    if (!window.confirm(`${action} ${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"}? ${restoring ? "They will appear in selling and search again." : "They won't appear in selling or search, but historical data is preserved."}`)) return;
    try {
      for (const id of selectedIds) await writeProductEditOffline(id, { archived: !restoring }, null, user);
      showToast(`${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"} ${restoring ? "restored" : "archived"}`, "success");
      setSelectedIds(new Set());
      setDeleteMode(false);
    } catch {
      showToast(`Couldn't ${restoring ? "restore" : "archive"} products. Try again.`, "danger");
    }
  }, [filter, selectedIds, showToast, user]);

  const startLongPress = useCallback((id: string) => {
    if (!canEditProducts) return;
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setDeleteMode(true);
      setSelectedIds(new Set([id]));
    }, 550);
  }, [canEditProducts]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const suppressLongPressNavigation = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!longPressTriggeredRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    longPressTriggeredRef.current = false;
  }, []);

  const result = useLiveQuery(async () => {
    try {
      const products = await tenantArray<Product>(db.products.orderBy("name"));
      let lowStockIds = new Set<string>();
      let bestSellerIds = new Set<string>();
      let expiringIds = new Set<string>();

      if (filter === "low-stock") {
        lowStockIds = await getLowStockProductIds(LOW_STOCK_THRESHOLD, stockBranchScope, products);
      } else if (filter === "best-sellers") {
        bestSellerIds = await getBestSellingProductIds();
      } else if (filter === "expiring") {
        expiringIds = await getExpiringProductIds(7, stockBranchScope, products);
      }

      return { products, lowStockIds, bestSellerIds, expiringIds, error: null as string | null };
    } catch (err) {
      return {
        products: [],
        lowStockIds: new Set<string>(),
        bestSellerIds: new Set<string>(),
        expiringIds: new Set<string>(),
        error: err instanceof Error ? err.message : "Could not load products.",
      };
    }
  }, [filter, stockBranchKey]);

  // Consolidated stock across all branches (business-level view, matching the
  // filter chips which run with branchId null). One read of the ledger per
  // live-query refresh; the figures below are derived from it, never from a
  // mutable quantity field (see .agents/rules/offline-sync-and-ledger.md).
  const stockByProduct = useLiveQuery(
    () => getStockByProduct(stockBranchScope),
    [stockBranchKey],
    new Map<string, number>()
  );

  const deferredQuery = useDeferredValue(debouncedQuery);

  const byFilter = useMemo(() => {
    if (!result) return [];
    return result.products.filter((product) => {
      if (filter === "archived") return Boolean(product.archived);
      if (product.archived) return false;
      if (filter === "low-stock") return result.lowStockIds.has(product.id);
      if (filter === "best-sellers") return result.bestSellerIds.has(product.id);
      if (filter === "expiring") return result.expiringIds.has(product.id);
      return true;
    });
  }, [result, filter]);

  const filtered = useMemo(() => {
    const { exact, suggestions } = searchProductsFuzzy(byFilter, deferredQuery);
    return [...exact, ...suggestions];
  }, [byFilter, deferredQuery]);

  // Ledger-derived current stock for a product (see getStockByProduct above).
  // `undefined` is preserved rather than collapsed to 0: a product created
  // with a blank starting stock has no ledger row, which is an absence of
  // data, not a quantity of zero. Rendering it as a red "Out of stock"
  // tells the owner something the ledger does not actually say.
  const stockFor = (product: Product) => stockByProduct.get(product.id);
  const statusFor = (product: Product) =>
    resolveStockStatus(stockFor(product), product.lowStockThreshold);

  // One wording + one colour for every product row. These two blocks used to
  // re-derive both inline, which is how the grid and the list ended up with
  // different thresholds and the same product looking fine in one and alarming
  // in the other.
  const stockToneFor = (product: Product) => {
    const status = statusFor(product);
    if (status === "out") return "text-danger";
    if (status === "low") return "text-warning";
    return "text-on-surface-muted";
  };

  const stockTextFor = (product: Product) => {
    const qty = stockFor(product);
    if (qty === undefined) return stockStatusLabel("untracked");
    if (qty <= 0) return stockStatusLabel("out");
    return `${qty.toLocaleString()} ${qty === 1 ? "unit" : "units"}`;
  };

  useEffect(() => {
    if (filtered.length <= visibleLimit) return;
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
  }, [filtered.length, visibleLimit]);

  if (!canViewProducts) {
    return (
      <div>
        <ScreenHeader title="Products" hideBack={true} />
        <PermissionDenied requiredCapabilities={["VIEW_PRODUCTS"]} />
      </div>
    );
  }

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title="Products" hideBack={true} />
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div>
        <ScreenHeader title="Products" hideBack={true} />
        <ErrorState message="Couldn't load your products." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (result.products.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Products" hideBack={true} />
        <EmptyState
          illustration={EmptyShelfIllustration}
          title="Your shelf is empty"
          description="Add your first product to start selling and tracking stock."
          action={
            canEditProducts
              ? { label: "Add a product", href: "/products/new", id: "empty-add-product" }
              : undefined
          }
        />
        {canEditProducts && (
          <div className="mx-auto mt-3 w-full max-w-md text-center">
            <Link
              href="/products/import"
              className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent hover:bg-brand-accent/10 transition-colors"
            >
              <Upload size={17} aria-hidden />
              Import products instead
            </Link>
          </div>
        )}
      </div>
    );
  }



  return (
    <div className="overflow-x-clip">
      <ScreenHeader title="Products" hideBack={true} />

      {canEditProducts && (
        <div className="mb-3 grid grid-cols-2 gap-2" aria-label="Add products">
          <Link
            href="/products/new"
            className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent px-3 text-center text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
          >
            <Plus size={17} aria-hidden />
            Add product
          </Link>
          <Link
            href="/products/import"
            className="flex min-h-[var(--touch-target-min)] items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand-accent/10 px-3 text-center text-[length:var(--font-size-body)] font-medium text-brand-accent hover:bg-brand-accent/15 transition-colors"
          >
            <Upload size={17} aria-hidden />
            Import products
          </Link>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-gutter sm:-mx-gutter-lg mb-3 bg-surface px-gutter sm:px-gutter-lg pb-3 pt-1">
        <SearchBar
          value={query}
          onChange={(val) => {
            setQuery(val);
            setSearchActive(Boolean(val.trim()));
          }}
          onFocus={() => setSearchActive(true)}
          onBlur={() => {
            if (!query.trim()) setSearchActive(false);
          }}
          placeholder="Search by name, SKU, or barcode"
          trailingAction={
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label="Scan barcode to search"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-surface-muted hover:bg-surface-container hover:text-on-surface active:scale-95 transition-colors"
            >
              <Camera size={18} aria-hidden />
            </button>
          }
        />
      </div>

      {scanning && (
        <BarcodeScanner
          onResult={(res) => {
            setQuery(res);
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      )}

      <p className="mb-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
        {result.products.length.toLocaleString()} of {PRODUCT_CAP.toLocaleString()} products used
      </p>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          {(Object.keys(FILTER_LABELS) as ProductFilter[]).map((key) => (
            <Chip
              key={key}
              variant="filter"
              selected={filter === key}
              onClick={() => setFilter(key)}
            >
              {FILTER_LABELS[key]}
            </Chip>
          ))}
        </div>

        {canEditProducts && (
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="More product actions"
              className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] items-center justify-center rounded-[var(--radius-control)] bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <MoreVertical size={18} aria-hidden />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation-2)] animate-step-in"
              >
                <Link
                  href="/purchases"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-[var(--touch-target-min)] items-center gap-2 px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
                >
                  <Truck size={16} aria-hidden />
                  Restocks
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { setDeleteMode(true); setMenuOpen(false); }}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center gap-2 px-4 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger/5 transition-colors"
                >
                  <Archive size={16} aria-hidden />
                  Select products to archive
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-6 min-h-[360px]">
          {debouncedQuery ? (
            <>
              <NoResultsState query={debouncedQuery} />
              {canEditProducts && (
                <div className="mt-4 flex justify-center">
                  <Link
                    href={`/products/new?barcode=${encodeURIComponent(debouncedQuery)}`}
                    className="inline-flex min-h-[var(--touch-target-min)] items-center rounded-[var(--radius-control)] bg-brand-accent px-4 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast"
                  >
                    Create product with barcode
                  </Link>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Package}
              title={
                filter === "low-stock"
                  ? "Nothing is low on stock"
                  : filter === "expiring"
                    ? "Nothing expiring soon"
                    : filter === "archived"
                      ? "No archived products"
                    : "Add your first product"
              }
              description={
                filter === "low-stock"
                  ? "Every product is above the low-stock threshold right now."
                  : filter === "expiring"
                    ? "Nothing is expired or due to expire in the next 7 days."
                    : filter === "archived"
                      ? "Archived products remain in history and can be restored here."
                    : "Your branch is set up and ready. Add products to start tracking inventory and ringing up sales."
              }
              action={
                filter === "all"
                  ? {
                    label: "Add product",
                    href: "/products/new",
                  }
                  : undefined
              }
            />
          )}
        </div>
      ) : (
        <div>
          <ul className="divide-y divide-outline-variant/30 rounded-3xl bg-surface-container/60 border border-outline-variant/30 overflow-hidden shadow-xs">
            {filtered.slice(0, visibleLimit).map((product) => (
              <li key={product.id} className="contain-list-item transition-colors hover:bg-surface-container-high/40">
                {deleteMode ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest("input")) return;
                      toggleSelect(product.id);
                    }}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all ${selectedIds.has(product.id)
                        ? "bg-brand-container text-on-brand-container"
                        : ""
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="h-5 w-5 shrink-0 accent-[var(--color-brand-accent)]"
                      aria-label={`Select ${product.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{product.name}</p>
                      <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {filter === "expiring" && product.expiryDate ? `Expires ${product.expiryDate}` : product.sku}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                        {formatCurrency(product.sellPrice)}
                      </p>
                      <p
                        className={`font-number text-[length:var(--font-size-caption)] tabular-nums ${stockToneFor(product)}`}
                      >
                        {stockTextFor(product)}
                      </p>
                    </div>
                  </button>
                ) : (
                  <div
                    onPointerDown={() => startLongPress(product.id)}
                    onPointerUp={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    title="Long press to select for archive"
                    className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors"
                  >
                    <RippleLink
                      href={`/products/${product.id}`}
                      onClick={suppressLongPressNavigation}
                      className="min-w-0 flex-1 flex flex-col gap-1 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="truncate text-[length:var(--font-size-body-lg)] font-bold text-on-surface">
                          {product.name}
                        </p>
                        {categories?.find((c) => c.id === product.categoryId)?.name && (
                          <span className="shrink-0 text-[10px] text-on-surface-muted bg-surface-container-high px-2 py-0.5 rounded-full font-medium">
                            {categories.find((c) => c.id === product.categoryId)?.name}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-number font-bold text-[length:var(--font-size-body)] tabular-nums text-on-surface">
                          {formatCurrency(product.sellPrice)}
                        </span>
                        {product.costPrice > 0 && (
                          <span className="text-xs text-on-surface-muted font-number tabular-nums">
                            Cost {formatCurrency(product.costPrice)}{" "}
                            {product.sellPrice > product.costPrice ? (
                              <span className="text-success font-medium">
                                (+{formatCurrency(product.sellPrice - product.costPrice)})
                              </span>
                            ) : null}
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            statusFor(product) === "out"
                              ? "bg-danger-container text-on-danger-container"
                              : statusFor(product) === "low"
                              ? "bg-warning-container text-on-warning-container"
                              : statusFor(product) === "ok"
                              ? "bg-success-container text-on-success-container"
                              : "bg-surface-container-high text-on-surface-muted"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              statusFor(product) === "out"
                                ? "bg-danger"
                                : statusFor(product) === "low"
                                ? "bg-warning"
                                : statusFor(product) === "ok"
                                ? "bg-success"
                                : "bg-outline"
                            }`}
                            aria-hidden
                          />
                          <span>{stockTextFor(product)}</span>
                        </span>
                        {filter === "expiring" && product.expiryDate && (
                          <span className="text-[11px] text-danger font-medium">
                            Expires {product.expiryDate}
                          </span>
                        )}
                      </div>
                    </RippleLink>

                    {/* 1-tap quick Sell button */}
                    <RippleLink
                      href={`/pos?add=${product.id}`}
                      className="shrink-0 flex h-8 items-center justify-center gap-1 rounded-full bg-brand-container px-3 text-xs font-semibold text-on-brand-container hover:brightness-95 active:scale-95 transition-all"
                      aria-label={`Sell ${product.name}`}
                    >
                      <span>+ Sell</span>
                    </RippleLink>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {filtered.length > visibleLimit && (
            <div ref={loadMoreRef} className="py-4 text-center text-sm text-on-surface-muted">
              Loading more...
            </div>
          )}
        </div>
      )}

      {/* Batch archive/restore floating action bar */}
      {deleteMode && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-8 left-3 right-3 sm:left-0 sm:right-0 sm:mx-auto z-40 flex max-w-xl md:max-w-2xl items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 shadow-elevated animate-step-in">
          <button
            type="button"
            onClick={() => { setDeleteMode(false); setSelectedIds(new Set()); }}
            className="flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] px-3 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
          >
            <X size={16} aria-hidden />
            Cancel
          </button>
          <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            {selectedIds.size} selected
          </span>
          <RippleButton
            type="button"
            onClick={handleArchiveSelected}
            disabled={selectedIds.size === 0}
            className={`flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] px-4 text-[length:var(--font-size-body)] font-medium text-white disabled:opacity-50 hover:opacity-95 transition-opacity ${
              filter === "archived" ? "bg-brand-accent" : "bg-danger"
            }`}
          >
            {filter === "archived" ? <RotateCcw size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
            {filter === "archived" ? "Restore" : "Archive"}
          </RippleButton>
        </div>
      )}

      {canEditProducts && !deleteMode && (
        <FAB
          id="tour-add-product"
          href="/products/new"
          label="Add product"
        >
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
