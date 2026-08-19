"use client";

import { useState, useEffect, useRef } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import dynamic from "next/dynamic";
import { Plus, Search, Package, Truck, Upload, Camera, MoreVertical } from "lucide-react";

// Loaded on demand — see the matching comment in
// src/features/pos/components/BrowseStep.tsx.
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
import { FAB } from "@/components/ui/FAB";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { tenantArray } from "@/lib/local-tenant";

const CAN_EDIT_PRODUCTS = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

type ProductFilter = "all" | "low-stock" | "best-sellers" | "expiring";

const FILTER_LABELS: Record<ProductFilter, string> = {
  all: "All",
  "low-stock": "Low stock",
  "best-sellers": "Fast sellers",
  expiring: "Expiring",
};

export default function ProductsPage() {
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
        if (filter === "low-stock") return result.lowStockIds.has(product.id);
        if (filter === "best-sellers") return result.bestSellerIds.has(product.id);
        if (filter === "expiring") return result.expiringIds.has(product.id);
        return true;
      })
    : [];

  const filtered = byFilter.filter((product) =>
    `${product.name} ${product.sku} ${product.barcode ?? ""}`.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

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
      <div className="flex flex-col h-screen">
        <ScreenHeader title="Products" hideBack={true} />
        <EmptyState
          illustration={EmptyShelfIllustration}
          title="Your shelf is empty"
          description="Add your first product to start selling and tracking stock."
          fullScreen
        />
        {hasAccountType(user, CAN_EDIT_PRODUCTS) && (
          <FAB id="tour-add-product" href="/products/new" label="Add product">
            <Plus size={26} aria-hidden />
          </FAB>
        )}
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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, SKU, or barcode"
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface"
            />
          </div>
          <button
            type="button"
            onClick={() => setScanning(true)}
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
                  <p className="shrink-0 font-mono text-[length:var(--font-size-body)] font-medium tabular-nums text-on-surface">
                    {formatCurrency(product.sellPrice)}
                  </p>
                </RippleLink>
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
      {hasAccountType(user, CAN_EDIT_PRODUCTS) && (
        <FAB id="tour-add-product" href="/products/new" label="Add product">
          <Plus size={26} aria-hidden />
        </FAB>
      )}
    </div>
  );
}
