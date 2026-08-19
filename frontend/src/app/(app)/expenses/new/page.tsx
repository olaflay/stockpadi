"use client";

import { useState } from "react";
import { useDraft } from "@/hooks/use-draft";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { SelectInput } from "@/components/ui/SelectInput";
import { TextInput } from "@/components/ui/TextInput";
import { useToast } from "@/components/ui/Toast";
import { RippleButton } from "@/components/ui/Ripple";
import { useCurrentUser, hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import { addExpense } from "@/features/expenses/add-expense";
import { EXPENSE_CATEGORY_SUGGESTIONS } from "@/types/expense";

const CAN_ADD_EXPENSES = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

export default function NewExpensePage() {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);

  const [category, setCategory, clearCategory] = useDraft<string>("stockpadi-draft-expense-category", EXPENSE_CATEGORY_SUGGESTIONS[0]);
  const [customCategory, setCustomCategory, clearCustomCategory] = useDraft("stockpadi-draft-expense-custom", "");
  const [amount, setAmount, clearAmount] = useDraft("stockpadi-draft-expense-amount", "");
  const [note, setNote, clearNote] = useDraft("stockpadi-draft-expense-note", "");
  const [branchId, setBranchId, clearBranch] = useDraft("stockpadi-draft-expense-branch", "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!hasAccountType(user, CAN_ADD_EXPENSES)) {
    return (
      <div>
        <ScreenHeader title="Add expense" onBack={() => router.push("/expenses")} />
        <PermissionDenied requiredAccountTypes={CAN_ADD_EXPENSES} />
      </div>
    );
  }

  const isOther = category === "Other";
  const effectiveCategory = isOther ? customCategory.trim() : category;
  const parsedAmount = Number(amount);
  const isValid = effectiveCategory.length > 0 && amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isValid) return;

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
      clearCategory();
      clearCustomCategory();
      clearAmount();
      clearNote();
      clearBranch();
      router.push("/expenses");
    } catch {
      showToast("Couldn't save the expense, try again.", "danger");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <ScreenHeader title="Add expense" onBack={() => router.push("/expenses")} />
      <form id="new-expense-form" onSubmit={handleSubmit} className="flex flex-col gap-4 pb-24">
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
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Custom category *</span>
            <TextInput
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="e.g. Repairs"
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
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
            placeholder="e.g. August shop rent"
          />
        </label>

      </form>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface border-t border-border z-[100] shadow-[var(--shadow-elevation-sticky-top)]">
        <RippleButton
          type="button"
          onClick={() => {
            const form = document.getElementById("new-expense-form") as HTMLFormElement;
            if (form) form.requestSubmit();
          }}
          disabled={!isValid || isSubmitting}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Saving…" : "Save expense"}
        </RippleButton>
      </div>
    </div>
  );
}
