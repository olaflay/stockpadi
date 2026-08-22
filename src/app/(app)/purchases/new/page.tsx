"use client";

import { useState } from "react";
import { useDraft } from "@/hooks/use-draft";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectInput } from "@/components/ui/SelectInput";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { RippleButton } from "@/components/ui/Ripple";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/format";
import { useCurrentUser, hasRole } from "@/features/auth/use-current-user";
import { addSupplier } from "@/features/purchases/add-supplier";
import { receivePurchase, type PurchaseLine } from "@/features/purchases/receive-purchase";

const CAN_ADD_PURCHASES = ["owner", "manager", "inventory_staff", "admin"] as const;

const inputClass =
  "min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface";

export default function NewPurchasePage() {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();

  const branches = useLiveQuery(() => db.branches.toArray(), [], []);
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), [], []);
  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [], []);

  const [branchId, setBranchId, clearBranchDraft] = useDraft<string>("stockpadi-draft-restock-branch", "");
  const [supplierId, setSupplierId, clearSupplierDraft] = useDraft<string | null>("stockpadi-draft-restock-supplier", null);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines, clearLinesDraft] = useDraft<Record<string, PurchaseLine>>("stockpadi-draft-restock-lines", {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!hasRole(user, [...CAN_ADD_PURCHASES])) {
    return (
      <div>
        <ScreenHeader title="Record restock" onBack={() => router.push("/purchases")} />
        <PermissionDenied requiredRoles={[...CAN_ADD_PURCHASES]} />
      </div>
    );
  }

  const effectiveBranchId = branchId || (branches?.length === 1 ? branches[0].id : "");
  const lineList = Object.values(lines);
  const total = lineList.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const selectedSupplier = suppliers?.find((s) => s.id === supplierId);

  const matchingProducts =
    productSearch.trim() && products
      ? products
          .filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(productSearch.toLowerCase()))
          .slice(0, 6)
      : [];

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
      await receivePurchase({
        branchId: effectiveBranchId,
        supplierId,
        lines: lineList,
        createdByUserId: user.id,
        actor: user,
      });
      showToast(`Restock recorded: ${formatCurrency(total)}`, "success");
      clearBranchDraft();
      clearSupplierDraft();
      clearLinesDraft();
      router.push("/purchases");
    } catch {
      showToast("Couldn't save the restock, try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Record restock" onBack={() => router.push("/purchases")} />

      {branches && branches.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Branch *</span>
          <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">-- Select branch --</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </SelectInput>
        </label>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Supplier *</span>
        {selectedSupplier ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-container-high px-3 py-2">
            <span className="text-[length:var(--font-size-body)] font-medium text-on-surface">{selectedSupplier.name}</span>
            <button
              type="button"
              onClick={() => setSupplierId(null)}
              className="min-h-[var(--touch-target-min)] px-2 text-[length:var(--font-size-caption)] font-medium text-brand-accent"
            >
              Change
            </button>
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
            {supplierSearch.trim() && (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                {(suppliers ?? [])
                  .filter((s) => `${s.name} ${s.phone ?? ""}`.toLowerCase().includes(supplierSearch.toLowerCase()))
                  .slice(0, 5)
                  .map((s) => (
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

            {showNewSupplierForm ? (
              <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container p-2">
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

      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Products *</span>
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
            aria-hidden
          />
          <input
            type="search"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Search products to add"
            className={`${inputClass} w-full pl-10`}
          />
        </div>
        {matchingProducts.length > 0 && (
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {matchingProducts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addLine(p.id, p.costPrice)}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between rounded-[var(--radius-control)] px-3 text-left text-[length:var(--font-size-body)] text-on-surface hover:bg-surface-container-high transition-colors"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-[length:var(--font-size-caption)] text-on-surface-muted">
                    cost {formatCurrency(p.costPrice)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lineList.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lineList.map((line) => {
            const product = products?.find((p) => p.id === line.productId);
            if (!product) return null;
            return (
              <li key={line.productId} className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[length:var(--font-size-body)] font-medium text-on-surface">{product.name}</p>
                  <button
                    type="button"
                    onClick={() => removeLine(line.productId)}
                    aria-label={`Remove ${product.name}`}
                    className="flex h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger/10 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex flex-1 flex-col gap-1 min-w-0">
                    <span className="text-[length:var(--font-size-caption)] text-on-surface-muted truncate">Qty ({product.unitLabel || "piece"})</span>
                    <input
                       type="number"
                       min="1"
                       step="1"
                       value={line.quantity}
                       onChange={(e) => updateLine(line.productId, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                       className={`${inputClass} w-full`}
                     />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 min-w-0">
                    <span className="text-[length:var(--font-size-caption)] text-on-surface-muted truncate">Unit cost</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.unitCost}
                      onChange={(e) => updateLine(line.productId, { unitCost: Math.max(0, Number(e.target.value) || 0) })}
                      className={`${inputClass} w-full`}
                    />
                  </label>
                </div>
                <p className="text-right text-[length:var(--font-size-caption)] text-on-surface-muted">
                  Line total: {formatCurrency(line.quantity * line.unitCost)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-3 border-t border-border bg-surface px-5 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3 font-semibold text-on-surface">
          <span>Total cost</span>
          <span className="text-[length:var(--font-size-title)]">{formatCurrency(total)}</span>
        </div>
        <RippleButton
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || lineList.length === 0 || !supplierId || !effectiveBranchId}
          className="min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Saving…" : "Receive restock"}
        </RippleButton>
      </div>
    </div>
  );
}
