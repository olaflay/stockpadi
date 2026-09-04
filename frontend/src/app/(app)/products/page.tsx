"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import { Plus, Search, Package, Truck, Upload, Camera, MoreVertical, Trash2, X } from "lucide-react";

const BarcodeScanner = dynamic(() => import("@/components/ui/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});

import { db } from "@/lib/db";
import type { Product } from "@/types/product";
import { getLowStockProductIds, getBestSellingProductIds, getExpiringProductIds } from "@/features/inventory/product-insights";
import { EmptyShelfIllustration } from "@/components/illustrations";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ErrorState } from "@/components/ui/ErrorState";
import { RippleLink } from "@/components/ui/Ripple";
import { RippleButton } from "@/components/ui/Ripple";
import { FAB } from "@/components/ui/FAB";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { tenantArray } from "@/lib/local-tenant";
import { PRODUCT_CAP } from "@/config/limits";
import { searchProductsFuzzy } from "@/lib/fuzzy-search";

const CAN_EDIT_PRODUCTS = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

type ProductFilter = "all" | "low-stock" | "best-sellers" | "expiring";

const FILTER_LABELS: Record<ProductFilter, string> = {
  all: "All",
  "low-stock": "Low stock",
  "best-sellers": "Fast sellers",
  expiring: "Expiring",
};

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const filterParam = searchParams.get("filter");
  const [filter, setFilter] = useState<ProductFilter>(
    filterParam !== null && filterParam in FILTER_LABELS ? (filterParam as ProductFilter) : "all"
  );
  const user = useCurrentUser();
  const [visibleLimit, setVisibleLimit] = useState(50);
  const [prevQuery, setPrevQuery] = useState("");
  const [prevFilter, setPrevFilter] = useState<ProductFilter>("all");
  const [scanning, setScanning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const debouncedQuery = useDebounce(query, 120);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    if (!window.confirm(`Archive ${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"}? They won't appear in searches but historical data is preserved.`)) return;
    try {
      await db.products.bulkUpdate(
        Array.from(selectedIds).map((id) => ({ key: id, changes: { archived: true } as Partial<Product> }))
      );
      showToast(`${selectedIds.size} product${selectedIds.size === 1 ? "" : "s"} archived`, "success");
      setSelectedIds(new Set());
      setDeleteMode(false);
    } catch {
      showToast("Couldn't archive products", "danger");
    }
  }, [selectedIds, showToast]);

  if (debouncedQuery !== prevQuery || filter !== prevFilter) {
    setPrevQuery(debouncedQuery);
    setPrevFilter(filter);
    setVisibleLimit(50);
  }

  const result = useLiveQuery(async () => {
    try {
      const products = await tenantArray<Product>(db.products.orderBy("name"));
      let lowStockIds = new Set<string>();
      let bestSellerIds = new Set<string>();
      let expiringIds = new Set<string>();

      if (filter === "low-stock") {
        lowStockIds = await getLowStockProductIds();
      } else if (filter === "best-sellers") {
        bestSellerIds = await getBestSellingProductIds();
      } else if (filter === "expiring") {
        expiringIds = await getExpiringProductIds();
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
  }, [filter]);

  const byFilter = result
    ? result.products.filter((product) => {
        if (product.archived) return false;
        if (filter === "low-stock") return result.lowStockIds.has(product.id);
        if (filter === "best-sellers") return result.bestSellerIds.has(product.id);
        if (filter === "expiring") return result.expiringIds.has(product.id);
        return true;
      })
    : [];

  const { exact, suggestions } = searchProductsFuzzy(byFilter, debouncedQuery);
  const filtered = [...exact, ...suggestions];

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
      <div className="flex flex-col flex-1 h-full min-h-[calc(100dvh-10rem)]">
        <ScreenHeader title="Products" hideBack={true} />
        <div className="flex flex-1 items-center justify-center my-auto">
          <EmptyState
            illustration={EmptyShelfIllustration}
            title="Your shelf is empty"
            description="Add your first product to start selling and tracking stock."
            action={
              hasAccountType(user, CAN_EDIT_PRODUCTS)
                ? { label: "Add a product", onClick: () => router.push("/products/new"), id: "empty-add-product" }
                : undefined
            }
          />
        </div>
      </div>
    );
  }



  return (
    <div className="overflow-x-hidden">
      <ScreenHeader title="Products" hideBack={true} />

      <div className="mb-3">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
              aria-hidden
            />
            <input
              type="search"
              aria-label="Search by name, SKU, or barcode"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, SKU, or barcode"
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface"
            />
          </div>
          <button
            type="button"
            onClick={() => setScanning(true)}
            aria-label="Scan barcode to search"
            className="flex min-h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface text-on-surface hover:bg-surface-container transition-colors"
          >
            <Camera size={18} aria-hidden />
          </button>
        </div>
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
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`min-h-[var(--touch-target-min)] shrink-0 rounded-[var(--radius-control)] px-4 text-[length:var(--font-size-body)] transition-colors ${
                filter === key
                  ? "bg-brand-accent text-brand-accent-contrast"
                  : "bg-surface-container text-on-surface-muted hover:bg-surface-container-high"
              }`}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>

        {hasAccountType(user, CAN_EDIT_PRODUCTS) && (
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
                  href="/products/import"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-[var(--touch-target-min)] items-center gap-2 px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors"
                >
                  <Upload size={16} aria-hidden />
                  Import
                </Link>
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
                  <Trash2 size={16} aria-hidden />
                  Delete selected
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        debouncedQuery ? (
          <NoResultsState query={debouncedQuery} />
        ) : (
          <EmptyState
            icon={Package}
            title={
              filter === "low-stock"
                ? "Nothing is low on stock"
                : filter === "expiring"
                  ? "Nothing expiring soon"
                  : "No products found"
            }
            description={
              filter === "low-stock"
                ? "Every product is above the low-stock threshold right now."
                : filter === "expiring"
                  ? "Nothing is expired or due to expire in the next 7 days."
                  : "Add products to start tracking stock."
            }
          />
        )
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {filtered.slice(0, visibleLimit).map((product) => (
              <li key={product.id}>
                {deleteMode ? (
                  <button
                    type="button"
                    onClick={() => toggleSelect(product.id)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-left transition-all ${
                      selectedIds.has(product.id)
                        ? "border-brand-accent bg-brand-accent/5"
                        : "border-border bg-surface hover:bg-surface-container"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      className="h-5 w-5 shrink-0 accent-[var(--color-brand-accent)]"
                      aria-label={`Select ${product.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{product.name}</p>
                      <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {filter === "expiring" && product.expiryDate ? `Expires ${product.expiryDate}` : product.sku}
                      </p>
                    </div>
                    <p className="shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                      {formatCurrency(product.sellPrice)}
                    </p>
                  </button>
                ) : (
                  <RippleLink
                    href={`/products/${product.id}`}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 hover:bg-surface-container active:scale-[0.99] transition-all"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--font-size-body-lg)] font-medium text-on-surface">{product.name}</p>
                      <p className="truncate text-[length:var(--font-size-caption)] text-on-surface-muted">
                        {filter === "expiring" && product.expiryDate ? `Expires ${product.expiryDate}` : product.sku}
                      </p>
                    </div>
                    <p className="shrink-0 font-number text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                      {formatCurrency(product.sellPrice)}
                    </p>
                  </RippleLink>
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

      {/* Batch delete floating action bar */}
      {deleteMode && (
        <div className="fixed bottom-20 left-0 right-0 z-[var(--z-fab)] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 shadow-elevated animate-step-in">
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
            className="flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] bg-danger px-4 text-[length:var(--font-size-body)] font-medium text-white disabled:opacity-50 hover:opacity-95 transition-opacity"
          >
            <Trash2 size={16} aria-hidden />
            Archive
          </RippleButton>
        </div>
      )}

      {hasAccountType(user, CAN_EDIT_PRODUCTS) && !deleteMode && (
        <FAB id="tour-add-product" href="/products/new" label="Add product">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
