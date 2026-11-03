"use client";

import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import { Plus, Package, Truck, Upload, Camera, MoreVertical, Archive, RotateCcw, X } from "lucide-react";

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
import { SearchBar } from "@/components/ui/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FAB } from "@/components/ui/FAB";
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

const STATUS_BADGE_STYLES: Record<string, { badge: string; dot: string }> = {
  out: { badge: "bg-danger-container/70 text-on-danger-container border border-danger/25", dot: "bg-danger" },
  low: { badge: "bg-warning-container/70 text-on-warning-container border border-warning/25", dot: "bg-warning" },
  ok: { badge: "bg-surface-container text-on-surface-muted border border-border/40", dot: "bg-outline" },
};
const DEFAULT_STATUS_BADGE = { badge: "bg-surface-container text-on-surface-muted border border-border/40", dot: "bg-outline" };

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const { isKeyboardVisible, isSearchActive, setSearchActive } = useNavigation();

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
  const isOwner = user.accountType === "BUSINESS_OWNER" || user.role === "owner";
  const stockBranchScope = user.accountType === "WORKER" ? (user.branchIds ?? []) : null;
  const stockBranchKey = stockBranchScope?.join(",") ?? "all";
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [prevQuery, setPrevQuery] = useState("");
  const [prevFilter, setPrevFilter] = useState<ProductFilter>("all");
  const [scanning, setScanning] = useState(false);
  // Set only when the current query came from a barcode scan. The search
  // box matches name, SKU, or barcode, so the query alone cannot say which
  // field a "create this" action should prefill.
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const { showToast } = useToast();
  const categories = useLiveQuery(() => tenantArray(db.categories), [], []);
  const categoryMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories]);

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
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleArchiveSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    setShowBulkConfirm(true);
  }, [selectedIds.size]);

  const executeArchiveSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const restoring = filter === "archived";
    try {
      for (const id of selectedIds) await writeProductEditOffline(id, { archived: !restoring }, null, user);
      showToast(`${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"} ${restoring ? "restored" : "archived"}`, "success");
      setSelectedIds(new Set());
      setDeleteMode(false);
      setShowBulkConfirm(false);
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

  const isAllSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  }, [isAllSelected, filtered]);

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
    const status = statusFor(product);
    if (status === "low") {
      return `Low · ${qty} left`;
    }
    return `${qty.toLocaleString()} in stock`;
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

      {/* Sticky Search Bar Container */}
      <div className="sticky top-0 z-20 -mx-gutter mb-2.5 bg-surface/95 px-gutter pb-2.5 pt-1 sm:-mx-gutter-lg sm:px-gutter-lg supports-[backdrop-filter:blur(1px)]:backdrop-blur-sm">
        <div className="flex h-12 items-stretch gap-2">
          <div className="h-12 min-w-0 flex-1">
            <SearchBar
              value={query}
              onChange={(val) => {
                setQuery(val);
                setScannedBarcode(null);
                setSearchActive(Boolean(val.trim()));
              }}
              onFocus={() => setSearchActive(true)}
              onBlur={() => {
                if (!query.trim()) setSearchActive(false);
              }}
              placeholder="Search"
              ariaLabel="Search by name, SKU, or barcode"
              shape="standalone"
            />
          </div>
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label="Scan barcode to search"
            title="Scan barcode to search"
            className="flex h-12 w-12 min-h-12 min-w-12 self-stretch shrink-0 touch-manipulation items-center justify-center rounded-[var(--radius-control)] bg-brand-container text-on-brand-container hover:bg-brand-container/80 active:scale-95 transition-all duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
          >
            <Camera size={19} aria-hidden />
          </button>
          {canEditProducts && (
            <div ref={menuRef} className="relative h-12 min-h-12 w-12 min-w-12 self-stretch shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls="product-actions-menu"
                aria-label="Manage products"
                className="flex h-12 w-12 min-h-12 min-w-12 self-stretch touch-manipulation items-center justify-center rounded-[var(--radius-control)] bg-surface-container-high text-on-surface hover:bg-surface-container-highest active:scale-95 transition-all duration-[var(--motion-duration-short)] ease-[var(--easing-standard)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
              >
                <MoreVertical size={20} aria-hidden />
              </button>
              {menuOpen && (
                <div
                  id="product-actions-menu"
                  role="menu"
                  aria-label="Product actions"
                  className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-[var(--radius-card)] bg-surface-container-high py-1 shadow-[var(--shadow-elevation-2)] animate-step-in"
                >
                  <Link href="/products/import" role="menuitem" onClick={() => setMenuOpen(false)} className="flex min-h-[var(--touch-target-min)] items-center gap-2 px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors">
                    <Upload size={16} aria-hidden />
                    Import products
                  </Link>
                  <Link href="/purchases" role="menuitem" onClick={() => setMenuOpen(false)} className="flex min-h-[var(--touch-target-min)] items-center gap-2 px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors">
                    <Truck size={16} aria-hidden />
                    Restocks
                  </Link>
                  <button type="button" role="menuitem" onClick={() => { setDeleteMode(true); setMenuOpen(false); }} className="flex min-h-[var(--touch-target-min)] w-full items-center gap-2 px-4 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger/5 transition-colors">
                    <Archive size={16} aria-hidden />
                    Select products to archive
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {scanning && (
        <BarcodeScanner
          backLabel="Back to products"
          onResult={(res) => {
            setQuery(res);
            setScannedBarcode(res);
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      )}

      {/* Filter Chips Bar (Full Width, uncluttered) */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(Object.keys(FILTER_LABELS) as ProductFilter[]).map((key) => (
            <Chip
              key={key}
              variant="filter"
              selected={filter === key}
              onClick={() => setFilter(key)}
              className="text-xs min-h-[28px] py-0.5 px-2.5"
            >
              {FILTER_LABELS[key]}
            </Chip>
          ))}
        </div>
      </div>

      {/* Catalog Capacity Metadata Caption */}
      <div className="mb-2.5 flex items-center justify-between px-0.5 text-[length:var(--font-size-caption)] text-on-surface-muted">
        <span className="font-number tabular-nums">
          {result.products.length.toLocaleString()} of {PRODUCT_CAP.toLocaleString()} products
        </span>
        {filter !== "all" && (
          <span className="font-medium text-on-surface-muted">
            Filter: {FILTER_LABELS[filter]} ({filtered.length})
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center py-6 min-h-[360px]">
          {debouncedQuery ? (
            <NoResultsState
              query={debouncedQuery}
              entityLabel="products"
              action={
                canEditProducts
                  ? scannedBarcode
                    ? {
                        label: "Create product with barcode",
                        href: `/products/new?barcode=${encodeURIComponent(scannedBarcode)}`,
                      }
                    : {
                        label: "Create product",
                        href: `/products/new?name=${encodeURIComponent(debouncedQuery)}`,
                      }
                  : undefined
              }
              onClear={() => {
                setQuery("");
                setScannedBarcode(null);
              }}
            />
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
                filter === "all" && canEditProducts
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
                        ? "bg-surface-container-high text-on-surface"
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
                        {product.categoryId && categoryMap.get(product.categoryId) && (
                          <span className="shrink-0 text-[length:var(--font-size-caption)] text-on-surface-muted bg-surface-container-high px-2 py-0.5 rounded-full font-medium">
                            {categoryMap.get(product.categoryId)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-number font-bold text-[length:var(--font-size-body)] tabular-nums text-on-surface">
                          {formatCurrency(product.sellPrice)}
                        </span>
                        {isOwner && product.costPrice > 0 && (
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
                        {(() => {
                          const status = statusFor(product);
                          const badge = STATUS_BADGE_STYLES[status] ?? DEFAULT_STATUS_BADGE;
                          return (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden />
                              <span>{stockTextFor(product)}</span>
                            </span>
                          );
                        })()}
                        {result?.bestSellerIds.has(product.id) && (
                          <span className="inline-flex items-center rounded-full bg-surface-container text-on-surface-muted border border-border/40 px-2 py-0.5 text-[11px] font-semibold">
                            Fast seller
                          </span>
                        )}
                        {filter === "expiring" && product.expiryDate && (
                          <span className="text-[11px] text-danger font-medium">
                            Expires {product.expiryDate}
                          </span>
                        )}
                      </div>
                    </RippleLink>

                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        cancelLongPress();
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 flex items-center justify-center pl-1"
                    >
                      <RippleLink
                        href={`/pos?add=${product.id}`}
                        className="flex min-h-[var(--touch-target-min)] min-w-[52px] items-center justify-center gap-1.5 rounded-full bg-surface-container text-on-surface border border-border/60 hover:bg-surface-container-high active:scale-95 px-3.5 text-xs font-bold transition-all shadow-xs"
                        aria-label={`Sell ${product.name}`}
                      >
                        <Plus size={15} aria-hidden />
                        <span>Sell</span>
                      </RippleLink>
                    </div>
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

      {canEditProducts &&
        filtered.length > 0 &&
        result.products.length < PRODUCT_CAP &&
        !deleteMode &&
        !scanning &&
        !menuOpen &&
        !showBulkConfirm &&
        !isKeyboardVisible &&
        !isSearchActive && (
          <FAB href="/products/new" label="Add product" id="products-add-fab" size="md">
            <Plus size={24} aria-hidden />
          </FAB>
        )}

      {/* Batch archive/restore floating action bar with Select All */}
      {deleteMode && (
        <div className="fixed bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-8 left-3 right-3 sm:left-0 sm:right-0 sm:mx-auto z-40 flex max-w-xl md:max-w-2xl items-center justify-between gap-2.5 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 shadow-elevated animate-step-in">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setDeleteMode(false); setSelectedIds(new Set()); }}
              className="flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
            >
              <X size={16} aria-hidden />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="flex min-h-[var(--touch-target-min)] items-center rounded-[var(--radius-control)] px-2.5 text-xs font-semibold text-brand-accent hover:bg-brand-accent/10 transition-colors"
            >
              {isAllSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <span className="text-xs font-number tabular-nums text-on-surface-muted truncate">
            {selectedIds.size} of {filtered.length} selected
          </span>

          <RippleButton
            type="button"
            onClick={handleArchiveSelected}
            disabled={selectedIds.size === 0}
            className={`flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-[var(--radius-control)] px-4 text-xs font-semibold disabled:opacity-50 hover:opacity-95 transition-opacity ${
              filter === "archived" ? "bg-brand-accent text-on-brand" : "bg-danger text-on-danger"
            }`}
          >
            {filter === "archived" ? <RotateCcw size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
            <span>{filter === "archived" ? "Restore" : "Archive"}</span>
          </RippleButton>
        </div>
      )}

      <ConfirmDialog
        isOpen={showBulkConfirm}
        onClose={() => setShowBulkConfirm(false)}
        onConfirm={executeArchiveSelected}
        title={`${filter === "archived" ? "Restore" : "Archive"} ${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"}?`}
        description={
          filter === "archived"
            ? "These products will be returned to inventory and available for sale again."
            : "These products will be hidden from selling and search. Historical sales records and stock movements remain protected."
        }
        confirmLabel={filter === "archived" ? "Restore products" : "Archive products"}
        cancelLabel="Cancel"
        variant={filter === "archived" ? "brand" : "danger"}
      />
    </div>
  );
}
