import { useState, type BaseSyntheticEvent } from "react";
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { RippleButton } from "@/components/ui/Ripple";
import { Modal } from "@/components/ui/Modal";
import { AlertTriangle } from "lucide-react";
import { LOW_STOCK_THRESHOLD } from "@/features/inventory/product-insights";
import {
  ProductCoreFields,
  ProductStockAlertField,
  ProductUnitConversionFields,
  ProductExpiryFields,
} from "@/features/inventory/components/ProductFormFields";
import type { CategoryOption } from "@/components/ui/CategoryAutocomplete";
import type { ProductFormInput, ProductFormValues } from "@/features/inventory/product-schema";
import { TextInput } from "@/components/ui/TextInput";
import { SelectInput } from "@/components/ui/SelectInput";
import type { LocalBranch } from "@/lib/db";

export function EditProductForm({
  totalStock,
  stockValueClass,
  stockInput,
  onStockInputChange,
  branches,
  stockBranchId,
  onStockBranchChange,
  onSubmit,
  register,
  setValue,
  errors,
  control,
  categories,
  categoryId,
  categoryInputName,
  onCategorySelect,
  showUnitConversion,
  onToggleUnitConversion,
  unitLabel,
  altUnitLabel,
  expiryTracking,
  isSubmitting,
  onDelete,
}: {
  totalStock: number | undefined;
  stockValueClass: string;
  stockInput?: string;
  onStockInputChange?: (value: string) => void;
  branches?: LocalBranch[];
  stockBranchId?: string | null;
  onStockBranchChange?: (id: string | null) => void;
  onSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
  register: UseFormRegister<ProductFormInput>;
  setValue: UseFormSetValue<ProductFormInput>;
  errors: FieldErrors<ProductFormInput>;
  control: Control<ProductFormInput, unknown, ProductFormValues>;
  categories: CategoryOption[] | undefined;
  categoryId: string;
  categoryInputName: string;
  onCategorySelect: (id: string, name: string) => void;
  showUnitConversion: boolean;
  onToggleUnitConversion: () => void;
  unitLabel: string;
  altUnitLabel: string;
  expiryTracking: ProductFormInput["expiryTracking"];
  isSubmitting: boolean;
  onDelete: () => Promise<void> | void;
}) {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  }

  return (
    <div className="pb-24">
      <div className="mb-4 rounded-[var(--radius-card)] bg-surface-container p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <p className="text-[length:var(--font-size-label)] font-medium text-on-surface">Current stock</p>
            <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
              Edit the number directly to adjust on-shelf quantity.
            </p>
          </div>
          <p className={`text-[length:var(--font-size-title)] font-semibold ${stockValueClass}`}>{totalStock ?? "…"}</p>
        </div>

        {onStockInputChange && (
          <div className="pt-3 border-t border-border flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                Adjust stock count ({unitLabel})
              </span>
              <TextInput
                type="number"
                min="0"
                inputMode="numeric"
                value={stockInput ?? ""}
                onChange={(e) => onStockInputChange(e.target.value)}
                placeholder={String(totalStock ?? 0)}
              />
            </label>

            {branches && branches.length > 1 && onStockBranchChange && (
              <label className="flex flex-col gap-1">
                <span className="text-[length:var(--font-size-caption)] text-on-surface-muted">Branch to adjust:</span>
                <SelectInput
                  value={stockBranchId ?? ""}
                  onChange={(e) => onStockBranchChange(e.target.value || null)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectInput>
              </label>
            )}
          </div>
        )}
      </div>
      <form id="edit-product-form" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ProductCoreFields
          register={register}
          setValue={setValue}
          errors={errors}
          categories={categories}
          categoryId={categoryId}
          categoryInputName={categoryInputName}
          onCategorySelect={onCategorySelect}
        />

        <ProductStockAlertField register={register} errors={errors} placeholder={`Default: ${LOW_STOCK_THRESHOLD}`} />

        <ProductUnitConversionFields
          register={register}
          errors={errors}
          showUnitConversion={showUnitConversion}
          onToggleUnitConversion={onToggleUnitConversion}
          unitLabel={unitLabel}
          altUnitLabel={altUnitLabel}
        />

        <ProductExpiryFields register={register} errors={errors} control={control} expiryTracking={expiryTracking} />

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setIsDeleteModalOpen(true)}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-danger/30 bg-surface px-5 py-2.5 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger/5 transition-all"
          >
            Delete Product
          </button>
        </div>
      </form>

      {/* Confirmation Warning Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => !isDeleting && setIsDeleteModalOpen(false)}
        title="Delete Product"
      >
        <div className="flex flex-col items-center gap-3 text-center py-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger mb-1">
            <AlertTriangle size={28} aria-hidden />
          </div>
          <p className="text-[length:var(--font-size-title)] font-semibold text-on-surface">
            Are you sure you want to delete this product?
          </p>
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted leading-relaxed max-w-sm">
            This will permanently remove the product from your shop catalog. Previous sales records will remain preserved in your ledger.
          </p>

          <div className="mt-4 flex w-full gap-3">
            <button
              type="button"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
              className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] border border-border px-4 text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <RippleButton
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex-1 min-h-[var(--touch-target-min)] rounded-[var(--radius-control)] bg-danger px-4 text-[length:var(--font-size-body)] font-semibold text-white hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {isDeleting ? "Deleting…" : "Yes, delete"}
            </RippleButton>
          </div>
        </div>
      </Modal>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface border-t border-border z-[100] shadow-[var(--shadow-elevation-sticky-top)]">
        <RippleButton
          type="button"
          onClick={() => {
            const form = document.getElementById("edit-product-form") as HTMLFormElement;
            if (form) form.requestSubmit();
          }}
          disabled={isSubmitting}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSubmitting ? "Saving…" : "Save changes"}
        </RippleButton>
      </div>
    </div>
  );
}
