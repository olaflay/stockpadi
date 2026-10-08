"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useDraft } from "@/hooks/use-draft";
import { useDebounce } from "@/hooks/use-debounce";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, ClipboardList, ChevronDown, ChevronUp, Check, AlertTriangle, Plus, Minus } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentStock } from "@/features/inventory/stock";
import { writeStockAdjustment } from "@/features/inventory/write-stock-adjustment";
import { ADJUSTMENT_REASON_CODES, ADJUSTMENT_REASON_LABELS, type AdjustmentReasonCode } from "@/types/stock-movement";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useNavigation } from "@/components/ui/NavigationContext";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import type { Product } from "@/types/product";
import { tenantArray } from "@/lib/local-tenant";
import type { LocalBranch } from "@/lib/db";

/**
 * Compact Stock-Count List Flow (Item 2f):
 * 1. Compact list of products: Name · Expected Stock · SKU
 * 2. Tapping a row smoothly expands an inline drawer for THAT product only
 * 3. Live real-time variance calculation (Match, Shrinkage, Surplus)
 * 4. Quick-stepper thumb controls (-5, -1, +1, +5)
 * 5. Reason code & note input with instantaneous local Dexie write
 */
export default function StockCountPage() {
  const user = useCurrentUser();
  const { showToast } = useToast();
  const { setSearchActive } = useNavigation();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [branchId, setBranchId] = useDraft<string | null>("stockpadi-draft-stockcount-branch", null);
  const [countedQuantity, setCountedQuantity] = useDraft("stockpadi-draft-stockcount-qty", "");
  const [reasonCode, setReasonCode] = useDraft<AdjustmentReasonCode>("stockpadi-draft-stockcount-reason", "recount");
  const [note, setNote] = useDraft("stockpadi-draft-stockcount-note", "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length > 0) {
      setSearchActive(true);
    }
  }, [query, setSearchActive]);

  const branches = useLiveQuery(async () => {
    const rows = await tenantArray<LocalBranch>(db.branches);
    return user.accountType === "WORKER" ? rows.filter((branch) => user.branchIds?.includes(branch.id)) : rows;
  }, [user.accountType, user.branchIds], []);

  const products = useLiveQuery(() => tenantArray<Product>(db.products.orderBy("name")), [], []);

  const effectiveBranchId = branchId ?? (branches && branches.length === 1 ? branches[0].id : null);

  const currentStock = useLiveQuery(
    () => (expandedId && effectiveBranchId ? getCurrentStock(expandedId, effectiveBranchId) : undefined),
    [expandedId, effectiveBranchId]
  );

  const [visibleLimit, setVisibleLimit] = useState(50);
  const debouncedQuery = useDebounce(query, 120);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const filtered = (products ?? []).filter((product) =>
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

  if (!hasCapability(user, "SUBMIT_STOCK_COUNT")) {
    return (
      <div>
        <ScreenHeader title="Stock count" />
        <PermissionDenied requiredCapabilities={["SUBMIT_STOCK_COUNT"]} />
      </div>
    );
  }

  if (branches === undefined || products === undefined) {
    return (
      <div>
        <ScreenHeader title="Stock count" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!effectiveBranchId) {
    if (branches.length === 0) {
      return (
        <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
          <ScreenHeader title="Stock count" />
          <EmptyState
            icon={ClipboardList}
            title="No branches yet"
            description="Add a branch in Settings before counting stock."
            action={{ label: "Add a branch", href: "/settings/branches" }}
          />
        </div>
      );
    }
    return (
      <div>
        <ScreenHeader title="Stock count" />
        <div className="flex flex-col gap-2">
          <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Which branch?</p>
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => setBranchId(branch.id)}
              className="min-h-[var(--touch-target-min)] rounded-[var(--radius-card)] bg-surface-container px-4 py-3 text-left text-[length:var(--font-size-body-lg)] text-on-surface hover:bg-surface-container-high transition-colors"
            >
              {branch.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function handleToggleRow(product: Product) {
    if (expandedId === product.id) {
      setExpandedId(null);
    } else {
      setExpandedId(product.id);
      setCountedQuantity("");
      setNote("");
      setReasonCode("recount");
    }
  }

  function adjustCount(delta: number) {
    const current = Number(countedQuantity || 0);
    const updated = Math.max(0, current + delta);
    setCountedQuantity(String(updated));
  }

  async function handleSubmit(product: Product) {
    if (!effectiveBranchId) return;
    const counted = Number(countedQuantity);
    if (!Number.isFinite(counted) || counted < 0) {
      showToast("Enter a valid counted quantity.", "danger");
      return;
    }

    setBusy(true);
    try {
      await writeStockAdjustment({
        branchId: effectiveBranchId,
        productId: product.id,
        countedQuantity: counted,
        reasonCode,
        note: note.trim() || null,
        createdByUserId: user.id,
        actor: user,
        operation: "stock_count",
      });
      showToast(user.accountType === "WORKER" ? `${product.name} count submitted for Owner review` : `${product.name} stock updated`, "success");
      setExpandedId(null);
      setCountedQuantity("");
      setNote("");
      setReasonCode("recount");
    } catch {
      showToast("Couldn't save this count. Try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
        <ScreenHeader title="Stock count" />
        <EmptyState
          icon={ClipboardList}
          title="No products yet"
          description="Add products before counting stock."
          action={{ label: "Add a product", href: "/products/new" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <ScreenHeader title="Stock count" />

      {hasAccountType(user, ["BUSINESS_OWNER", "ADMIN"]) && (
        <Link
          href="/purchases/update-stock"
          className="flex min-h-[var(--touch-target-min)] items-center justify-center rounded-[var(--radius-control)] border border-border px-3 text-center text-[length:var(--font-size-caption)] font-medium text-on-surface hover:bg-surface-container transition-colors"
        >
          Adjust multiple products
        </Link>
      )}

      {/* Search Input */}
      <div className="relative w-full">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-muted" aria-hidden />
        <input
          type="search"
          aria-label="Search by name, SKU, or barcode"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisibleLimit(50);
            setSearchActive(Boolean(e.target.value.trim()));
          }}
          onFocus={() => setSearchActive(true)}
          onBlur={() => {
            if (!query.trim()) setSearchActive(false);
          }}
          placeholder="Search product to count…"
          className="min-h-[var(--touch-target-min)] w-full rounded-2xl bg-surface-container-low pl-10 pr-4 text-sm text-on-surface outline-none focus:ring-2 focus:ring-brand-accent/20"
        />
      </div>

      {filtered.length === 0 ? (
        <NoResultsState query={debouncedQuery} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.slice(0, visibleLimit).map((product) => {
            const isExpanded = expandedId === product.id;
            const expected = isExpanded ? currentStock : undefined;
            const countedNum = countedQuantity !== "" ? Number(countedQuantity) : null;
            const variance = expected !== undefined && countedNum !== null ? countedNum - expected : null;

            return (
              <li
                key={product.id}
                className="overflow-hidden rounded-2xl bg-surface-container transition-all shadow-sm"
              >
                {/* Compact Row Header */}
                <button
                  type="button"
                  onClick={() => handleToggleRow(product)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-surface-container-high transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium text-on-surface">{product.name}</p>
                    <p className="truncate text-xs text-on-surface-muted mt-0.5">
                      {product.sku ? `SKU: ${product.sku}` : "No SKU"}
                      {product.unitLabel ? ` · ${product.unitLabel}` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg bg-surface-container-high px-2.5 py-1 text-xs font-semibold text-on-surface">
                      Tap to count
                    </span>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-on-surface-muted" aria-hidden />
                    ) : (
                      <ChevronDown size={18} className="text-on-surface-muted" aria-hidden />
                    )}
                  </div>
                </button>

                {/* Inline Expandable Count Form */}
                {isExpanded && (
                  <div className="border-t border-border/20 bg-surface-container-low p-4 flex flex-col gap-4 animate-in fade-in-50 duration-150">
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container p-3">
                      <div>
                        <p className="text-xs text-on-surface-muted font-medium">Expected on shelf</p>
                        <p className="text-lg font-bold text-on-surface">{expected ?? "…"}</p>
                      </div>

                      {/* Live Variance Indicator */}
                      {variance !== null && (
                        <div
                          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                            variance === 0
                              ? "bg-brand-container text-on-brand-container"
                              : variance < 0
                              ? "bg-danger-container text-on-danger-container"
                              : "bg-brand-accent/15 text-brand-accent"
                          }`}
                        >
                          {variance === 0 ? (
                            <>
                              <Check size={14} />
                              <span>Exact Match</span>
                            </>
                          ) : variance < 0 ? (
                            <>
                              <AlertTriangle size={14} />
                              <span>{variance} (Shrinkage)</span>
                            </>
                          ) : (
                            <>
                              <Plus size={14} />
                              <span>+{variance} (Surplus)</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Counted Quantity Field + Steppers */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`count-input-${product.id}`} className="text-xs font-semibold text-on-surface-muted">
                        Physical count
                      </label>
                      <div className="flex items-center gap-2">
                        <TextInput
                          id={`count-input-${product.id}`}
                          value={countedQuantity}
                          onChange={(e) => setCountedQuantity(e.target.value.replace(/[^\d]/g, ""))}
                          inputMode="numeric"
                          placeholder="e.g. 42"
                          autoFocus
                          className="text-lg font-semibold"
                        />
                      </div>

                      {/* Quick Stepper Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => adjustCount(-5)}
                          className="flex-1 rounded-xl bg-surface-container py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                        >
                          -5
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustCount(-1)}
                          className="flex-1 rounded-xl bg-surface-container py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                        >
                          <Minus size={14} className="mx-auto" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustCount(1)}
                          className="flex-1 rounded-xl bg-surface-container py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                        >
                          <Plus size={14} className="mx-auto" />
                        </button>
                        <button
                          type="button"
                          onClick={() => adjustCount(5)}
                          className="flex-1 rounded-xl bg-surface-container py-2 text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
                        >
                          +5
                        </button>
                      </div>
                    </div>

                    {/* Reason Code */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`reason-select-${product.id}`} className="text-xs font-semibold text-on-surface-muted">
                        Reason for adjustment
                      </label>
                      <SelectInput
                        id={`reason-select-${product.id}`}
                        value={reasonCode}
                        onChange={(e) => setReasonCode(e.target.value as AdjustmentReasonCode)}
                      >
                        {ADJUSTMENT_REASON_CODES.map((code) => (
                          <option key={code} value={code}>
                            {ADJUSTMENT_REASON_LABELS[code]}
                          </option>
                        ))}
                      </SelectInput>
                    </div>

                    {/* Optional Note */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`note-input-${product.id}`} className="text-xs font-semibold text-on-surface-muted">
                        Note (optional)
                      </label>
                      <TextInput
                        id={`note-input-${product.id}`}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. damaged box, misplaced batch"
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedId(null)}
                        className="rounded-xl px-4 py-2.5 text-xs font-semibold text-on-surface-muted hover:text-on-surface transition-colors"
                      >
                        Cancel
                      </button>
                      <RippleButton
                        type="button"
                        onClick={() => handleSubmit(product)}
                        disabled={busy || countedQuantity === ""}
                        className="flex-1 rounded-xl bg-brand-accent py-2.5 text-xs font-bold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
                      >
                        {busy ? "Saving…" : "Save count"}
                      </RippleButton>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > visibleLimit && (
        <div ref={loadMoreRef} className="py-4 text-center text-sm text-on-surface-muted">
          Loading more...
        </div>
      )}
    </div>
  );
}
