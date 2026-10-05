"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, ArrowUpRight, Receipt, Package, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { hasCapability } from "@/features/auth/authorization";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { addExpense } from "@/features/expenses/add-expense";
import { receivePurchase } from "@/features/purchases/receive-purchase";
import { addSupplier } from "@/features/purchases/add-supplier";
import { EXPENSE_CATEGORY_SUGGESTIONS } from "@/types/expense";
import { formatCurrency } from "@/lib/format";
import type { Supplier } from "@/types/purchase";
import type { Product } from "@/types/product";

export interface AddExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: "expense" | "restock";
}

interface RestockLineItem {
  id: string;
  productId: string;
  quantity: number;
  unitCost: number;
}

type DateOption = "today" | "yesterday" | "custom";

/**
 * Unified Outflow Modal: Record either general shop expenses (OPEX)
 * or inventory restocks (Purchases / Stock movements), with date tracking
 * and backdating support so every outflow is accurately recorded.
 */
export function AddExpenseSheet({
  isOpen,
  onClose,
  onSuccess,
  initialMode = "expense",
}: AddExpenseSheetProps) {
  const user = useCurrentUser();
  const { showToast } = useToast();

  const canManageExpenses = hasCapability(user, "MANAGE_EXPENSES");
  const canReceiveStock = hasCapability(user, "RECEIVE_STOCK");

  // Determine initial active mode based on permissions
  const defaultMode: "expense" | "restock" = useMemo(() => {
    if (initialMode === "restock" && canReceiveStock) return "restock";
    if (canManageExpenses) return "expense";
    if (canReceiveStock) return "restock";
    return "expense";
  }, [initialMode, canManageExpenses, canReceiveStock]);

  const [mode, setMode] = useState<"expense" | "restock">(defaultMode);

  // Sync mode if initialMode changes
  useEffect(() => {
    if (isOpen) {
      setMode(defaultMode);
    }
  }, [isOpen, defaultMode]);

  // Live queries for branches, suppliers, and active products
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  const suppliers = useLiveQuery(() => tenantArray<Supplier>(db.suppliers), [], []);
  const products = useLiveQuery(
    () => tenantArray<Product>(db.products.orderBy("name")).then((all) => all.filter((p) => !p.archived)),
    [],
    []
  );

  // Date selector state
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [dateOption, setDateOption] = useState<DateOption>("today");
  const [customDate, setCustomDate] = useState<string>(todayStr);

  // Branch state
  const [branchId, setBranchId] = useState<string>("");

  // Expense form state
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORY_SUGGESTIONS[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");

  // Restock form state
  const [supplierId, setSupplierId] = useState<string>("");
  const [showNewSupplierInline, setShowNewSupplierInline] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const [restockLines, setRestockLines] = useState<RestockLineItem[]>([
    { id: crypto.randomUUID(), productId: "", quantity: 1, unitCost: 0 },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to resolve the ISO timestamp based on dateOption
  function resolveCreatedAtIso(): string {
    const now = new Date();
    if (dateOption === "today") {
      return now.toISOString();
    }
    if (dateOption === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString();
    }
    if (dateOption === "custom" && customDate) {
      const [year, month, day] = customDate.split("-").map(Number);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        const customDateTime = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
        return customDateTime.toISOString();
      }
    }
    return now.toISOString();
  }

  // --- Expense Mode Calculations ---
  const isOtherCategory = category === "Other";
  const effectiveCategory = isOtherCategory ? customCategory.trim() : category;
  const parsedExpenseAmount = Number(expenseAmount);
  const isExpenseValid =
    effectiveCategory.length > 0 &&
    expenseAmount.trim() !== "" &&
    Number.isFinite(parsedExpenseAmount) &&
    parsedExpenseAmount > 0 &&
    (dateOption !== "custom" || customDate.trim() !== "");

  // --- Restock Mode Calculations ---
  const effectiveBranchId = branchId || (branches?.length === 1 ? branches[0].id : "");
  const totalRestockAmount = restockLines.reduce(
    (sum, line) => sum + (line.productId ? line.quantity * line.unitCost : 0),
    0
  );
  const validRestockLines = restockLines.filter(
    (l) => l.productId && l.quantity > 0 && l.unitCost >= 0
  );
  const isRestockValid =
    Boolean(effectiveBranchId) &&
    Boolean(supplierId) &&
    validRestockLines.length > 0 &&
    (dateOption !== "custom" || customDate.trim() !== "");

  // Reset helper
  function resetForms() {
    setDateOption("today");
    setCustomDate(todayStr);
    setExpenseAmount("");
    setExpenseNote("");
    setCustomCategory("");
    setSupplierId("");
    setShowNewSupplierInline(false);
    setNewSupplierName("");
    setNewSupplierPhone("");
    setRestockLines([{ id: crypto.randomUUID(), productId: "", quantity: 1, unitCost: 0 }]);
  }

  // Handle new supplier inline creation
  async function handleCreateSupplierInline() {
    const name = newSupplierName.trim();
    if (!name || isSavingSupplier) return;
    setIsSavingSupplier(true);
    try {
      const created = await addSupplier({
        name,
        phone: newSupplierPhone.trim() || null,
        actor: user,
      });
      setSupplierId(created.id);
      setShowNewSupplierInline(false);
      setNewSupplierName("");
      setNewSupplierPhone("");
      showToast(`Supplier "${name}" created`, "success");
    } catch {
      showToast("Could not create supplier. Try again.", "danger");
    } finally {
      setIsSavingSupplier(false);
    }
  }

  // Restock line management
  function handleProductSelect(lineId: string, selectedProductId: string) {
    const product = products?.find((p) => p.id === selectedProductId);
    setRestockLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        return {
          ...line,
          productId: selectedProductId,
          unitCost: product ? product.costPrice || 0 : line.unitCost,
        };
      })
    );
  }

  function handleLineChange(lineId: string, patch: Partial<RestockLineItem>) {
    setRestockLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line))
    );
  }

  function handleAddLine() {
    setRestockLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), productId: "", quantity: 1, unitCost: 0 },
    ]);
  }

  function handleRemoveLine(lineId: string) {
    if (restockLines.length <= 1) return;
    setRestockLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  // Form submissions
  async function handleExpenseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isExpenseValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const createdAtIso = resolveCreatedAtIso();
      await addExpense({
        branchId: branchId || null,
        category: effectiveCategory,
        amount: parsedExpenseAmount,
        note: expenseNote.trim() || null,
        createdByUserId: user.id,
        actor: user,
        createdAtIso,
      });
      showToast(`${effectiveCategory} expense recorded (${formatCurrency(parsedExpenseAmount)})`, "success");
      resetForms();
      onClose();
      onSuccess?.();
    } catch {
      showToast("Couldn't save the expense. Try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRestockSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isRestockValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const createdAtIso = resolveCreatedAtIso();
      await receivePurchase({
        branchId: effectiveBranchId,
        supplierId,
        lines: validRestockLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
        createdByUserId: user.id,
        actor: user,
        createdAtIso,
      });
      showToast(`Restock recorded (${formatCurrency(totalRestockAmount)})`, "success");
      resetForms();
      onClose();
      onSuccess?.();
    } catch {
      showToast("Couldn't save the restock. Try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record Outflow"
      variant="sheet"
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4">
        {/* Top Segmented Mode Switcher (if user has capabilities for both) */}
        {canManageExpenses && canReceiveStock && (
          <div className="flex rounded-[var(--radius-control)] bg-surface-container p-1 border border-border/60">
            <button
              type="button"
              onClick={() => setMode("expense")}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium rounded-[calc(var(--radius-control)-2px)] transition-all ${
                mode === "expense"
                  ? "bg-surface text-on-surface font-semibold shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface"
              }`}
            >
              <Receipt size={16} aria-hidden />
              <span>Shop Expense</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("restock")}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 px-3 text-xs sm:text-sm font-medium rounded-[calc(var(--radius-control)-2px)] transition-all ${
                mode === "restock"
                  ? "bg-surface text-on-surface font-semibold shadow-sm"
                  : "text-on-surface-muted hover:text-on-surface"
              }`}
            >
              <Package size={16} aria-hidden />
              <span>Stock Restock</span>
            </button>
          </div>
        )}

        {/* Date Dropdown (Shared for accurate outflow tracking) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Date *</span>
            <SelectInput
              value={dateOption}
              onChange={(e) => setDateOption(e.target.value as DateOption)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="custom">Specific date…</option>
            </SelectInput>
          </label>

          {dateOption === "custom" && (
            <label className="flex flex-col gap-1 animate-step-in">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Choose date *</span>
              <TextInput
                type="date"
                max={todayStr}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            </label>
          )}

          {/* Branch selector (if multi-branch) */}
          {branches && branches.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
                Branch {mode === "restock" ? "*" : "(optional)"}
              </span>
              <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {mode === "expense" && <option value="">Business-wide</option>}
                {mode === "restock" && <option value="">Select branch…</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectInput>
            </label>
          )}
        </div>

        {/* MODE 1: SHOP EXPENSE FORM */}
        {mode === "expense" && (
          <form onSubmit={handleExpenseSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Category *</span>
              <SelectInput value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORY_SUGGESTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectInput>
            </label>

            {isOtherCategory && (
              <label className="flex flex-col gap-1 animate-step-in">
                <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
                  Custom category name *
                </span>
                <TextInput
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. Generator repairs"
                />
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Amount *</span>
              <TextInput
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Note (optional)</span>
              <TextInput
                value={expenseNote}
                onChange={(e) => setExpenseNote(e.target.value)}
                placeholder="e.g. Fuel for generator or transport receipt"
              />
            </label>

            <div className="pt-2">
              <RippleButton
                type="submit"
                disabled={!isExpenseValid || isSubmitting}
                className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
              >
                {isSubmitting ? "Saving…" : "Save Expense"}
              </RippleButton>
            </div>
          </form>
        )}

        {/* MODE 2: STOCK RESTOCK FORM */}
        {mode === "restock" && (
          <form onSubmit={handleRestockSubmit} className="flex flex-col gap-3">
            {/* Supplier Selector */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Supplier *</span>
                <button
                  type="button"
                  onClick={() => setShowNewSupplierInline((prev) => !prev)}
                  className="flex items-center gap-1 text-xs font-semibold text-brand-accent hover:underline py-0.5"
                >
                  <UserPlus size={14} aria-hidden />
                  {showNewSupplierInline ? "Cancel" : "+ New supplier"}
                </button>
              </div>

              {!showNewSupplierInline ? (
                <SelectInput
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  hasError={!supplierId && validRestockLines.length > 0}
                >
                  <option value="">Select a supplier…</option>
                  {(suppliers ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ""}
                    </option>
                  ))}
                </SelectInput>
              ) : (
                <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-container-low p-3 border border-border animate-step-in">
                  <span className="text-xs font-semibold text-on-surface">Add New Supplier</span>
                  <TextInput
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="Supplier or distributor name *"
                  />
                  <TextInput
                    type="tel"
                    value={newSupplierPhone}
                    onChange={(e) => setNewSupplierPhone(e.target.value)}
                    placeholder="Phone number (optional)"
                  />
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleCreateSupplierInline}
                      disabled={!newSupplierName.trim() || isSavingSupplier}
                      className="px-3 py-1.5 rounded-[var(--radius-control)] bg-brand-accent text-xs font-semibold text-brand-accent-contrast disabled:opacity-50"
                    >
                      {isSavingSupplier ? "Saving…" : "Save & Select"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Restock Items List */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Products received *</span>
                <span className="text-xs text-on-surface-muted">
                  Total: <strong className="text-on-surface">{formatCurrency(totalRestockAmount)}</strong>
                </span>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[36vh] overflow-y-auto pr-0.5">
                {restockLines.map((line, index) => {
                  const lineTotal = (line.quantity || 0) * (line.unitCost || 0);
                  return (
                    <div
                      key={line.id}
                      className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border/80 bg-surface-container-low p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-on-surface-muted w-4">#{index + 1}</span>
                        <div className="flex-1">
                          <SelectInput
                            value={line.productId}
                            onChange={(e) => handleProductSelect(line.id, e.target.value)}
                          >
                            <option value="">Choose product…</option>
                            {(products ?? []).map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.unitLabel})
                              </option>
                            ))}
                          </SelectInput>
                        </div>
                        {restockLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="p-1.5 text-on-surface-muted hover:text-danger rounded-md transition-colors"
                            aria-label="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pl-6">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-on-surface-muted">Qty</span>
                          <TextInput
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) =>
                              handleLineChange(line.id, { quantity: Math.max(1, Number(e.target.value)) })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[11px] text-on-surface-muted">Unit Cost</span>
                          <TextInput
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={line.unitCost}
                            onChange={(e) =>
                              handleLineChange(line.id, { unitCost: Math.max(0, Number(e.target.value)) })
                            }
                          />
                        </label>
                      </div>

                      <div className="flex justify-end pl-6 pr-1 pt-0.5">
                        <span className="text-[11px] text-on-surface-muted">
                          Subtotal: <strong className="text-on-surface">{formatCurrency(lineTotal)}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleAddLine}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-[var(--radius-control)] border border-dashed border-border hover:border-brand-accent text-xs font-semibold text-on-surface hover:text-brand-accent transition-colors"
              >
                <Plus size={15} />
                <span>Add another product</span>
              </button>
            </div>

            {/* Advanced wizard link */}
            <div className="flex justify-end pt-1">
              <Link
                href="/purchases/new"
                onClick={onClose}
                className="flex items-center gap-1 text-xs text-brand-accent hover:underline"
              >
                <span>Bulk shipment or barcode scan? Open full wizard</span>
                <ArrowUpRight size={13} aria-hidden />
              </Link>
            </div>

            {/* Submit Restock Button */}
            <div className="pt-2">
              <RippleButton
                type="submit"
                disabled={!isRestockValid || isSubmitting}
                className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
              >
                {isSubmitting
                  ? "Saving…"
                  : `Save Restock (${formatCurrency(totalRestockAmount)})`}
              </RippleButton>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

// Re-export under both names for clear architectural naming
export { AddExpenseSheet as RecordOutflowModal };
