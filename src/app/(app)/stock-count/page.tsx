"use client";

import { useState, useEffect, useRef } from "react";
import { useDraft } from "@/hooks/use-draft";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, ClipboardList } from "lucide-react";
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
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import type { Product } from "@/types/product";

const CAN_COUNT_STOCK: Array<"owner" | "manager" | "inventory_staff" | "admin"> = [
  "owner",
  "manager",
  "inventory_staff",
  "admin",
];

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface";

/** Pick a product, enter the counted quantity, mandatory reason. docs/RESEARCH-AND-PLAN.md Phase 2 item 19. */
export default function StockCountPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const { showToast } = useToast();
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useDraft<string | null>("stockpadi-draft-stockcount-branch", null);
  const [activeProduct, setActiveProduct] = useDraft<Product | null>("stockpadi-draft-stockcount-product", null);
  const [countedQuantity, setCountedQuantity, clearCountedQuantity] = useDraft("stockpadi-draft-stockcount-qty", "");
  const [reasonCode, setReasonCode, clearReasonCode] = useDraft<AdjustmentReasonCode>("stockpadi-draft-stockcount-reason", "recount");
  const [note, setNote, clearNote] = useDraft("stockpadi-draft-stockcount-note", "");
  const [busy, setBusy] = useState(false);

  const branches = useLiveQuery(() => db.branches.toArray(), [], []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);
  const currentStock = useLiveQuery(
    () => (activeProduct && branchId ? getCurrentStock(activeProduct.id, branchId) : undefined),
    [activeProduct, branchId]
  );

  const [visibleLimit, setVisibleLimit] = useState(50);
  const debouncedQuery = useDebounce(query, 120);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [prevQuery, setPrevQuery] = useState("");
  if (debouncedQuery !== prevQuery) {
    setPrevQuery(debouncedQuery);
    setVisibleLimit(50);
  }

  const filtered = products.filter((product) =>
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

  if (!hasRole(user, CAN_COUNT_STOCK)) {
    return (
      <div>
        <ScreenHeader title="Stock Count" onBack={() => router.push("/dashboard")} />
        <PermissionDenied requiredRoles={CAN_COUNT_STOCK} />
      </div>
    );
  }

  if (branches === undefined || products === undefined) {
    return (
      <div>
        <ScreenHeader title="Stock Count" onBack={() => router.push("/dashboard")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const effectiveBranchId = branchId ?? (branches.length === 1 ? branches[0].id : null);

  if (!effectiveBranchId) {
    if (branches.length === 0) {
      return (
        <div className="flex min-h-[calc(100vh-140px)] flex-col">
          <ScreenHeader title="Stock Count" onBack={() => router.push("/dashboard")} />
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={ClipboardList}
              title="No branches yet"
              description="Add a branch in Settings before counting stock."
              action={{ label: "Add a branch", onClick: () => router.push("/settings/branches") }}
            />
          </div>
        </div>
      );
    }
    return (
      <div>
        <ScreenHeader title="Stock Count" onBack={() => router.push("/dashboard")} />
        <div className="flex flex-col gap-2">
            <p className="text-[length:var(--font-size-label)] text-on-surface-muted">Which branch?</p>
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                onClick={() => setBranchId(branch.id)}
                className="min-h-[var(--touch-target-min)] rounded-[var(--radius-card)] border border-border px-4 py-3 text-left text-[length:var(--font-size-body-lg)] text-on-surface hover:bg-surface-container transition-colors"
              >
                {branch.name}
              </button>
            ))}
        </div>
      </div>
    );
  }

  async function handleSubmit() {
    if (!activeProduct || !effectiveBranchId) return;
    const counted = Number(countedQuantity);
    if (!Number.isFinite(counted) || counted < 0) {
      showToast("Enter a valid counted quantity.", "danger");
      return;
    }

    setBusy(true);
    try {
      await writeStockAdjustment({
        branchId: effectiveBranchId,
        productId: activeProduct.id,
        countedQuantity: counted,
        reasonCode,
        note: note.trim() || null,
        createdByUserId: user.id,
        actor: user,
      });
      showToast(`${activeProduct.name} updated`, "success");
      setActiveProduct(null);
      clearCountedQuantity();
      clearNote();
      clearReasonCode();
    } catch {
      showToast("Couldn't save this count. Try again.", "danger");
    } finally {
      setBusy(false);
    }
  }

  if (activeProduct) {
    return (
      <div className="flex flex-col gap-4">
        <ScreenHeader title={activeProduct.name} onBack={() => setActiveProduct(null)} />

        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">
          Currently {currentStock ?? "…"} in stock at this branch.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Counted quantity</span>
          <input
            value={countedQuantity}
            onChange={(e) => setCountedQuantity(e.target.value.replace(/[^\d]/g, ""))}
            className={inputClass}
            inputMode="numeric"
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Reason</span>
          <SelectInput value={reasonCode} onChange={(e) => setReasonCode(e.target.value as AdjustmentReasonCode)}>
            {ADJUSTMENT_REASON_CODES.map((code) => (
              <option key={code} value={code}>
                {ADJUSTMENT_REASON_LABELS[code]}
              </option>
            ))}
          </SelectInput>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </label>

        <RippleButton
          type="button"
          onClick={handleSubmit}
          disabled={busy || countedQuantity === ""}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {busy ? "Saving…" : "Save count"}
        </RippleButton>
      </div>
    );
  }



  if (products.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-140px)] flex-col">
        <ScreenHeader title="Stock Count" onBack={() => router.push("/dashboard")} />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={ClipboardList}
            title="No products yet"
            description="Add products before counting stock."
            action={{ label: "Add a product", onClick: () => router.push("/products/new") }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Stock Count" onBack={() => router.push("/dashboard")} />

      <div className="relative mb-3 w-full">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, SKU, or barcode"
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface pl-10 pr-3 text-[length:var(--font-size-body)] text-on-surface"
        />
      </div>

      {filtered.length === 0 ? (
        <NoResultsState query={debouncedQuery} />
      ) : (
        <div>
          <ul className="flex flex-col gap-2">
            {filtered.slice(0, visibleLimit).map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setActiveProduct(product)}
                  className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3 text-left hover:bg-surface-container transition-colors"
                >
                  <p className="truncate text-[length:var(--font-size-body-lg)] text-on-surface">{product.name}</p>
                  <p className="shrink-0 text-[length:var(--font-size-caption)] text-on-surface-muted">{product.sku}</p>
                </button>
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
    </div>
  );
}
