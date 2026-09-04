import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { BaseSyntheticEvent } from "react";
import { RippleButton } from "@/components/ui/Ripple";
import { SelectInput } from "@/components/ui/SelectInput";
import type { CategoryOption } from "@/components/ui/CategoryAutocomplete";
import type { LocalBranch } from "@/lib/db";
import {
  ProductCoreFields,
  ProductStockAlertField,
  ProductUnitConversionFields,
  ProductExpiryFields,
} from "@/features/inventory/components/ProductFormFields";
import type { ProductFormInput, ProductFormValues } from "@/features/inventory/product-schema";
import { TextInput } from "@/components/ui/TextInput";

export function NewProductForm({
  onSubmit,
  onCancel,
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
  initialStock,
  onInitialStockChange,
  hasInitialStock,
  branches,
  initialStockBranchId,
  onInitialStockBranchChange,
}: {
  onSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
  onCancel?: () => void;
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
  initialStock: string;
  onInitialStockChange: (value: string) => void;
  hasInitialStock: boolean;
  branches: LocalBranch[] | undefined;
  initialStockBranchId: string | null;
  onInitialStockBranchChange: (branchId: string | null) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 pb-24">
      <ProductCoreFields
        register={register}
        setValue={setValue}
        errors={errors}
        categories={categories}
        categoryId={categoryId}
        categoryInputName={categoryInputName}
        onCategorySelect={onCategorySelect}
        autoFocusName
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Starting stock (optional)</span>
          <TextInput
            type="number"
            min="0"
            inputMode="numeric"
            value={initialStock}
            onChange={(e) => onInitialStockChange(e.target.value)}
            placeholder="0"
          />
        </label>

        <ProductStockAlertField register={register} errors={errors} placeholder="e.g. 5" />
      </div>

      {hasInitialStock && branches && branches.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Which branch is this stock at?</span>
          <SelectInput
            value={initialStockBranchId ?? ""}
            onChange={(e) => onInitialStockBranchChange(e.target.value || null)}
          >
            <option value="">-- Select branch --</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectInput>
        </label>
      )}

      <ProductUnitConversionFields
        register={register}
        errors={errors}
        showUnitConversion={showUnitConversion}
        onToggleUnitConversion={onToggleUnitConversion}
        unitLabel={unitLabel}
        altUnitLabel={altUnitLabel}
      />

      <ProductExpiryFields register={register} errors={errors} control={control} expiryTracking={expiryTracking} />

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface border-t border-border z-[100] shadow-[var(--shadow-elevation-sticky-top)]">
        <div className="flex items-center gap-3 max-w-lg mx-auto w-full">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[var(--touch-target-min)] px-5 rounded-[var(--radius-control)] border border-border bg-surface-container text-[length:var(--font-size-body)] font-medium text-on-surface hover:bg-surface-container-high transition-colors shrink-0"
            >
              Cancel
            </button>
          )}
          <RippleButton
            id="tour-save-product"
            type="submit"
            disabled={isSubmitting}
            className="min-h-[var(--touch-target-min)] flex-1 rounded-[var(--radius-control)] bg-brand-accent px-5 text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
          >
            {isSubmitting ? "Saving…" : "Save product"}
          </RippleButton>
        </div>
      </div>
    </form>
  );
}
