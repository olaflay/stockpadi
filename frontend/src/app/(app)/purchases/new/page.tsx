"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useDraft, clearDraftStorage } from "@/hooks/use-draft";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Package, Search, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectInput } from "@/components/ui/SelectInput";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleButton } from "@/components/ui/Ripple";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { type DateOption, resolveDateOptionIso } from "@/lib/date";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { addSupplier } from "@/features/purchases/add-supplier";
import { receivePurchase, type PurchaseLine } from "@/features/purchases/receive-purchase";
import { RestockLineRow } from "@/features/purchases/components/RestockLineRow";

const BarcodeScanner = dynamic(
  () => import("@/components/ui/BarcodeScanner").then((m) => m.BarcodeScanner),
  { ssr: false }
);

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface focus-visible:outline-none focus-visible:border-brand-accent focus-visible:ring-1 focus-visible:ring-brand-accent";

function NewPurchaseContent() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  const suppliers = useLiveQuery(() => tenantArray(db.suppliers), [], []);
  const products = useLiveQuery(() => tenantArray(db.products.orderBy("name")), [], []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [branchId, setBranchId] = useDraft<string>("stockpadi-draft-restock-branch", "");
  const [supplierId, setSupplierId] = useDraft<string | null>("stockpadi-draft-restock-supplier", null);
  const [dateOption, setDateOption] = useDraft<DateOption>("stockpadi-draft-restock-date-option", "today");
  const [customDate, setCustomDate] = useDraft<string>("stockpadi-draft-restock-custom-date", todayStr);
  const [lines, setLines, clearLinesDraft] = useDraft<Record<string, PurchaseLine>>("stockpadi-draft-restock-lines", {});

  const [supplierSearch, setSupplierSearch] = useState("");
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync incoming search query parameters (e.g. from AddExpenseSheet or deep links)
  useEffect(() => {
    const qBranch = searchParams.get("branchId");
    if (qBranch) setBranchId(qBranch);
    const qSupplier = searchParams.get("supplierId");
    if (qSupplier) setSupplierId(qSupplier);
    const qDate = searchParams.get("dateOption") as DateOption | null;
    if (qDate && ["today", "yesterday", "custom"].includes(qDate)) setDateOption(qDate);
    const qCustom = searchParams.get("customDate");
    if (qCustom) setCustomDate(qCustom);
  }, [searchParams, setBranchId, setSupplierId, setDateOption, setCustomDate]);

  if (!hasCapability(user, "RECEIVE_STOCK")) {
    return (
      <div>
        <ScreenHeader title="Receive delivery" backHref="/purchases" />
        <PermissionDenied requiredCapabilities={["RECEIVE_STOCK"]} />
      </div>
    );
  }

  const effectiveBranchId = branchId || (branches?.length === 1 ? branches[0].id : "");
  const lineList = Object.values(lines);
  const itemCount = lineList.reduce((sum, l) => sum + l.quantity, 0);
  const total = lineList.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const supplierList = suppliers ?? [];
  const selectedSupplier = supplierList.find((s) => s.id === supplierId);

  const matchingSuppliers =
    supplierSearch.trim() && supplierList.length > 0
      ? supplierList
          .filter((s) => `${s.name} ${s.phone ?? ""}`.toLowerCase().includes(supplierSearch.toLowerCase()))
          .slice(0, 5)
      : [];

  const matchingProducts =
    productSearch.trim() && products
      ? products
          .filter((p) => `${p.name} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase().includes(productSearch.toLowerCase()))
          .slice(0, 6)
      : [];

  const hasNoProducts = (products ?? []).length === 0;

  function addLine(productId: string, unitCost: number) {
    setLines((current) => {
      const existing = current[productId];
      return {
        ...current,
        [productId]: {
          productId,
          unitCost: existing?.unitCost ?? unitCost,
          quantity: (existing?.quantity ?? 0) + 1,
        },
      };
    });
    setProductSearch("");
  }

  function updateLine(productId: string, changes: Partial<PurchaseLine>) {
    setLines((current) => {
      const existing = current[productId];
      if (!existing) return current;
      return { ...current, [productId]: { ...existing, ...changes } };
    });
  }

  function removeLine(productId: string) {
    setLines((current) => {
      const copy = { ...current };
      delete copy[productId];
      return copy;
    });
  }

  function handleBarcodeResult(scannedCode: string) {
    const code = scannedCode.trim().toLowerCase();
    const matched = (products ?? []).find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code) ||
        (p.sku && p.sku.toLowerCase() === code)
    );
    if (matched) {
      addLine(matched.id, matched.costPrice || 0);
      showToast(`Added ${matched.name}`, "success");
    } else {
      showToast(`No product matching barcode "${scannedCode}"`, "warning");
    }
  }

  async function handleAddSupplier() {
    const name = newSupplierName.trim();
    if (!name) return;
    const supplier = await addSupplier({ name, phone: newSupplierPhone.trim() || null, actor: user });
    setSupplierId(supplier.id);
    setNewSupplierName("");
    setNewSupplierPhone("");
    setShowNewSupplierForm(false);
    showToast(`${name} added`, "success");
  }

  async function handleSubmit() {
    if (!effectiveBranchId) {
      showToast("Choose which branch this stock is going to.", "warning");
      return;
    }
    if (!supplierId) {
      showToast("Choose a supplier first.", "warning");
      return;
    }
    if (lineList.length === 0) {
      showToast("Add at least one product.", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const createdAtIso = resolveDateOptionIso(dateOption, customDate);
      await receivePurchase({
        branchId: effectiveBranchId,
        supplierId,
        lines: lineList,
        createdByUserId: user.id,
        actor: user,
        createdAtIso,
      });
      showToast(`Delivery recorded: ${formatCurrency(total)}`, "success");
      setBranchId(effectiveBranchId);
      clearLinesDraft();
      clearDraftStorage("stockpadi-draft-restock-lines");
      setDateOption("today");
      router.replace("/purchases");
    } catch {
      showToast("Couldn't save the restock, try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Receive delivery" backHref="/purchases" />

      {/* Delivery Date Selection */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Delivery date *</span>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setDateOption("today")}
            className={`min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] px-3 text-xs sm:text-sm font-semibold transition-all border ${
              dateOption === "today"
                ? "bg-brand-accent text-brand-accent-contrast border-brand-accent shadow-sm"
                : "bg-surface text-on-surface border-border hover:bg-surface-container"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setDateOption("yesterday")}
            className={`min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] px-3 text-xs sm:text-sm font-semibold transition-all border ${
              dateOption === "yesterday"
                ? "bg-brand-accent text-brand-accent-contrast border-brand-accent shadow-sm"
                : "bg-surface text-on-surface border-border hover:bg-surface-container"
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => setDateOption("custom")}
            className={`min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] px-3 text-xs sm:text-sm font-semibold transition-all border ${
              dateOption === "custom"
                ? "bg-brand-accent text-brand-accent-contrast border-brand-accent shadow-sm"
                : "bg-surface text-on-surface border-border hover:bg-surface-container"
            }`}
          >
            Pick date…
          </button>
        </div>
        {dateOption === "custom" && (
          <input
            type="date"
            max={todayStr}
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        )}
      </div>

      {branches && branches.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Branch *</span>
          <SelectInput value={effectiveBranchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">-- Select branch --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectInput>
        </label>
      )}

      {/* Supplier Selection */}
      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Supplier *</span>

        {selectedSupplier ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-brand-accent/40 bg-surface-container-high px-3 py-2">
            <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">{selectedSupplier.name}</span>
            <button
              type="button"
              onClick={() => setSupplierId(null)}
              className="min-h-[var(--touch-target-min)] px-2 text-[length:var(--font-size-caption)] font-medium text-brand-accent"
            >
              Change
            </button>
          </div>
        ) : supplierList.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container p-3">
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              No suppliers yet. Add your first supplier to record stock.
            </p>
            <input
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="Supplier name"
              className={inputClass}
            />
            <input
              value={newSupplierPhone}
              onChange={(e) => setNewSupplierPhone(e.target.value)}
              placeholder="Phone (optional)"
              className={inputClass}
            />
            <RippleButton
              type="button"
              onClick={handleAddSupplier}
              disabled={!newSupplierName.trim()}
              className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50"
            >
              Add supplier
            </RippleButton>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="Search supplier by name or phone"
              className={inputClass}
            />

            {supplierSearch.trim() && matchingSuppliers.length > 0 && (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {matchingSuppliers.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierSearch("");
                      }}
                      className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between rounded-[var(--radius-control)] px-3 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container-high transition-colors"
                    >
                      <span>{s.name}</span>
                      {s.phone && (
                        <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">{s.phone}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {supplierSearch.trim() && matchingSuppliers.length === 0 && (
              <p className="flex flex-wrap items-center justify-between gap-2 px-1 text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">No supplier named “{supplierSearch.trim()}”.</span>
                <button
                  type="button"
                  onClick={() => {
                    setNewSupplierName(supplierSearch.trim());
                    setSupplierSearch("");
                    setShowNewSupplierForm(true);
                  }}
                  className="font-medium text-brand-accent"
                >
                  Add it
                </button>
              </p>
            )}

            {showNewSupplierForm ? (
              <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container p-2">
                <p className="text-[length:var(--font-size-caption)] font-medium text-on-surface">Add supplier</p>
                <input
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Supplier name"
                  className={inputClass}
                />
                <input
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className={inputClass}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewSupplierForm(false);
                      setNewSupplierName("");
                      setNewSupplierPhone("");
                    }}
                    className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-surface-container-high px-3 text-[length:var(--font-size-caption)] font-medium text-on-surface"
                  >
                    Cancel
                  </button>
                  <RippleButton
                    type="button"
                    onClick={handleAddSupplier}
                    disabled={!newSupplierName.trim()}
                    className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-caption)] font-medium text-brand-accent-contrast disabled:opacity-50"
                  >
                    Add supplier
                  </RippleButton>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewSupplierForm(true)}
                className="flex min-h-[var(--touch-target-min)] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-border text-[length:var(--font-size-body)] font-medium text-brand-accent"
              >
                <UserPlus size={18} aria-hidden />
                New supplier
              </button>
            )}
          </>
        )}
      </div>

      {/* Products & Barcode Scanning */}
      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Products *</span>

        {hasNoProducts ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-5">
            <div className="flex items-center gap-3">
              <Package size={20} className="text-on-surface-muted" aria-hidden />
              <div className="flex flex-col">
                <p className="font-medium text-on-surface">No products yet</p>
                <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                  Add products to your catalog first, then receive stock for them here.
                </p>
              </div>
            </div>
            <RippleButton
              type="button"
              onClick={() => router.push("/products/new")}
              className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast hover:opacity-95 transition-opacity"
            >
              Add product
            </RippleButton>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={18}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
                  aria-hidden
                />
                <input
                  type="search"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search product name or barcode…"
                  className={`${inputClass} w-full pl-10`}
                />
              </div>
              <button
                type="button"
                onClick={() => setIsScanning(true)}
                className="flex min-h-[var(--touch-target-min)] shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-brand-accent/40 bg-brand-accent/10 px-3.5 text-[length:var(--font-size-body)] font-semibold text-brand-accent hover:bg-brand-accent/20 active:scale-95 transition-all"
                aria-label="Scan barcode with camera"
                title="Scan barcode with camera"
              >
                <Camera size={19} aria-hidden />
                <span className="text-xs sm:text-sm font-semibold">Scan</span>
              </button>
            </div>

            {productSearch.trim() && matchingProducts.length > 0 && (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {matchingProducts.map((p) => {
                  const added = lines[p.id];
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addLine(p.id, p.costPrice)}
                        className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container-high transition-colors"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{p.name}</span>
                          {p.sku && (
                            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                              SKU {p.sku}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {added && (
                            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[length:var(--font-size-caption)] font-medium text-on-surface">
                              In list ×{added.quantity}
                            </span>
                          )}
                          {p.costPrice > 0 && (
                            <span className="font-number text-[length:var(--font-size-caption)] tabular-nums text-on-surface-muted">
                              {formatCurrency(p.costPrice)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {productSearch.trim() && matchingProducts.length === 0 && (
              <p className="flex flex-wrap items-center justify-between gap-2 px-1 text-[length:var(--font-size-caption)]">
                <span className="text-on-surface-muted">No product matches “{productSearch.trim()}”.</span>
                <button
                  type="button"
                  onClick={() => router.push("/products/new")}
                  className="font-medium text-brand-accent"
                >
                  Add product
                </button>
              </p>
            )}
          </>
        )}
      </div>

      {/* Scanned / Added Lines List */}
      {lineList.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
              Items ({lineList.length})
            </span>
            <button
              type="button"
              onClick={clearLinesDraft}
              aria-label="Clear all items"
              className="text-[length:var(--font-size-caption)] font-medium text-danger hover:underline"
            >
              Clear all
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {lineList.map((line) => {
              const product = products?.find((p) => p.id === line.productId);
              if (!product) return null;
              return (
                <RestockLineRow
                  key={line.productId}
                  line={line}
                  product={product}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                />
              );
            })}
          </ul>
        </div>
      )}

      {/* Continuous Barcode Scanner with Interactive Split View */}
      {isScanning && (
        <BarcodeScanner
          onResult={handleBarcodeResult}
          onCancel={() => setIsScanning(false)}
          bottomBar={
            <div className="flex items-center justify-between gap-3 max-w-xl mx-auto w-full">
              <div className="min-w-0">
                <p className="text-xs text-on-surface-muted truncate">
                  {itemCount} {itemCount === 1 ? "unit" : "units"} in delivery
                </p>
                <p className="font-number font-bold text-base text-on-surface truncate tabular-nums">
                  {formatCurrency(total)}
                </p>
              </div>
              <RippleButton
                type="button"
                onClick={() => setIsScanning(false)}
                className="shrink-0 rounded-[var(--radius-control)] bg-brand-accent px-5 py-2.5 text-xs font-semibold text-brand-accent-contrast shadow-sm hover:brightness-105 active:scale-95 transition-all"
              >
                Done Scanning
              </RippleButton>
            </div>
          }
        >
          {lineList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-brand-accent/10 text-brand-accent flex items-center justify-center mb-2">
                <Camera size={24} aria-hidden />
              </div>
              <p className="text-sm font-semibold text-on-surface">Ready to scan delivery</p>
              <p className="text-xs text-on-surface-muted mt-1 max-w-xs">
                Hold barcodes in the camera view above. Scanned items appear here with live steppers.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-on-surface-muted">
                  Delivery Items ({lineList.length})
                </span>
                <span className="text-xs text-brand-accent font-medium">
                  Tap + to bump quantity
                </span>
              </div>
              {lineList.map((line) => {
                const product = products?.find((p) => p.id === line.productId);
                if (!product) return null;
                return (
                  <RestockLineRow
                    key={line.productId}
                    line={line}
                    product={product}
                    onUpdate={updateLine}
                    onRemove={removeLine}
                  />
                );
              })}
            </div>
          )}
        </BarcodeScanner>
      )}

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky bottom-0 z-20 mt-auto -mx-gutter sm:-mx-gutter-lg flex flex-col gap-2 cta-scrim-container px-gutter sm:px-gutter-lg pt-1.5 pb-[max(0.375rem,calc(env(safe-area-inset-bottom,0px)+0.25rem))] transition-all duration-200">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-semibold text-on-surface">Total cost</span>
            <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              {itemCount} {itemCount === 1 ? "unit" : "units"}
            </span>
          </div>
          <span className="font-number text-[length:var(--font-size-title)] font-semibold tabular-nums text-on-surface">
            {formatCurrency(total)}
          </span>
        </div>
        <RippleButton
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Saving…" : "Save delivery"}
        </RippleButton>
      </div>
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 p-4">
          <Skeleton className="h-12 w-full rounded-[var(--radius-control)]" />
          <Skeleton className="h-28 w-full rounded-[var(--radius-card)]" />
          <Skeleton className="h-44 w-full rounded-[var(--radius-card)]" />
        </div>
      }
    >
      <NewPurchaseContent />
    </Suspense>
  );
}
