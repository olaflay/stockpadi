import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { BaseSyntheticEvent } from "react";
import { RippleButton } from "@/components/ui/Ripple";
import { LOW_STOCK_THRESHOLD } from "@/features/inventory/product-insights";
import {
  ProductCoreFields,
  ProductStockAlertField,
  ProductUnitConversionFields,
  ProductExpiryFields,
} from "@/features/inventory/components/ProductFormFields";
import type { CategoryOption } from "@/components/ui/CategoryAutocomplete";
import type { ProductFormInput, ProductFormValues } from "@/features/inventory/product-schema";

export function EditProductForm({
  totalStock,
  stockValueClass,
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
  onDelete: () => void;
}) {
  return (
    <div className="pb-24">
      <div className="mb-4 rounded-[var(--radius-card)] bg-surface-container px-4 py-3">
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">Current stock</p>
        <p className={`text-[length:var(--font-size-title)] font-semibold ${stockValueClass}`}>{totalStock ?? "…"}</p>
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
            onClick={onDelete}
            className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-danger/30 bg-surface px-5 py-2.5 text-[length:var(--font-size-body)] font-medium text-danger hover:bg-danger/5 transition-all"
          >
            Delete Product
          </button>
        </div>
      </form>

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
