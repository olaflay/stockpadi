"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Modal } from "@/components/ui/Modal";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { addExpense } from "@/features/expenses/add-expense";
import { EXPENSE_CATEGORY_SUGGESTIONS } from "@/types/expense";

interface AddExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Bottom-sheet modal for fast, zero-navigation expense recording.
 */
export function AddExpenseSheet({ isOpen, onClose, onSuccess }: AddExpenseSheetProps) {
  const user = useCurrentUser();
  const { showToast } = useToast();
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);

  const [category, setCategory] = useState<string>(EXPENSE_CATEGORY_SUGGESTIONS[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [branchId, setBranchId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOther = category === "Other";
  const effectiveCategory = isOther ? customCategory.trim() : category;
  const parsedAmount = Number(amount);
  const isValid = effectiveCategory.length > 0 && amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addExpense({
        branchId: branchId || null,
        category: effectiveCategory,
        amount: parsedAmount,
        note: note.trim() || null,
        createdByUserId: user.id,
        actor: user,
      });
      showToast(`${effectiveCategory} expense recorded`, "success");
      setAmount("");
      setNote("");
      setCustomCategory("");
      onClose();
      onSuccess?.();
    } catch {
      showToast("Couldn't save the expense. Try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Expense" variant="sheet">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        {isOther && (
          <label className="flex flex-col gap-1 animate-step-in">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Custom category name *</span>
            <TextInput
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="e.g. Generator repairs"
              autoFocus
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Amount (₦) *</span>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus={!isOther}
          />
        </label>

        {branches && branches.length > 1 && (
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Branch (optional)</span>
            <SelectInput value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Business-wide</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </SelectInput>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Note (optional)</span>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Fuel for the shop gen"
          />
        </label>

        <div className="pt-2">
          <RippleButton
            type="submit"
            disabled={!isValid || isSubmitting}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
          >
            {isSubmitting ? "Saving…" : "Save Expense"}
          </RippleButton>
        </div>
      </form>
    </Modal>
  );
}
