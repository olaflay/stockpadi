import type { Control, FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
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
  FieldError,
} from "@/features/inventory/components/ProductFormFields";
import type { ProductFormInput, ProductFormValues } from "@/features/inventory/product-schema";
import { TextInput } from "@/components/ui/TextInput";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { formatCurrency } from "@/lib/format";
import type { AddedProductSummary } from "@/features/inventory/use-new-product-form";

export function NewProductForm({
  onSubmit,
  onCancel,
  register,
  setValue,
  watch,
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
  initialStockError,
  hasInitialStock,
  branches,
  initialStockBranchId,
  initialStockBranchError,
  onInitialStockBranchChange,
  onNameChange,
  onSkuChange,
  onSaveAndAddAnother,
  lastAddedProduct,
  onDismissLastAddedProduct,
}: {
  onSubmit: (event?: BaseSyntheticEvent) => Promise<void>;
  onCancel?: () => void;
  onSaveAndAddAnother?: (event?: BaseSyntheticEvent) => Promise<void>;
  lastAddedProduct?: AddedProductSummary | null;
  onDismissLastAddedProduct?: () => void;
  register: UseFormRegister<ProductFormInput>;
  setValue: UseFormSetValue<ProductFormInput>;
  watch?: UseFormWatch<ProductFormInput>;
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
  initialStockError: string | null;
  hasInitialStock: boolean;
  branches: LocalBranch[] | undefined;
  initialStockBranchId: string | null;
  initialStockBranchError: string | null;
  onInitialStockBranchChange: (branchId: string | null) => void;
  onNameChange?: (value: string) => void;
  onSkuChange?: (value: string) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 pb-72 md:pb-36 scroll-pb-64">
      {lastAddedProduct && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-success-container/25 p-3.5 border border-success/30 text-xs animate-step-in">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-success-contrast font-bold text-sm">
              ✓
            </div>
            <div>
              <div className="font-semibold text-on-surface text-sm">
                {lastAddedProduct.name} added!
              </div>
              <div className="text-on-surface-muted flex items-center gap-1.5 mt-0.5 font-medium">
                <span>{formatCurrency(lastAddedProduct.sellPrice)}</span>
                <span>·</span>
                <span className="text-success font-semibold">
                  +{formatCurrency(lastAddedProduct.profit)}/pc ({Math.round(lastAddedProduct.margin)}% margin)
                </span>
              </div>
            </div>
          </div>
          {onDismissLastAddedProduct && (
            <button
              type="button"
              onClick={onDismissLastAddedProduct}
              aria-label="Dismiss banner"
              className="text-on-surface-muted hover:text-on-surface p-1 text-base font-semibold"
            >
              ×
            </button>
          )}
        </div>
      )}

      <ProductCoreFields
        register={register}
        setValue={setValue}
        watch={watch}
        errors={errors}
        categories={categories}
        categoryId={categoryId}
        categoryInputName={categoryInputName}
        onCategorySelect={onCategorySelect}
        autoFocusName
        onNameChange={onNameChange}
        onSkuChange={onSkuChange}
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
            Starting stock on hand
            <InfoTooltip text="How many units you currently have in the shop right now." />
          </span>
          <TextInput
            type="number"
            min="0"
            inputMode="numeric"
            value={initialStock}
            onChange={(e) => onInitialStockChange(e.target.value)}
            placeholder="0"
            hasError={Boolean(initialStockError)}
            errorId="starting-stock-error"
          />
          <FieldError id="starting-stock-error" error={initialStockError ?? undefined} />
        </label>

        <ProductStockAlertField register={register} errors={errors} placeholder="e.g. 5" />
      </div>

      {hasInitialStock && branches && branches.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Which branch is this stock at? *</span>
          <SelectInput
            value={initialStockBranchId ?? ""}
            onChange={(e) => onInitialStockBranchChange(e.target.value || null)}
            hasError={Boolean(initialStockBranchError)}
            aria-describedby={initialStockBranchError ? "starting-stock-branch-error" : undefined}
          >
            <option value="">-- Select branch --</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </SelectInput>
          <FieldError id="starting-stock-branch-error" error={initialStockBranchError ?? undefined} />
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

      <div className="fixed bottom-0 left-0 right-0 z-40 px-4 py-2 pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)+0.35rem))] bg-surface/95 backdrop-blur-md border-t border-border/60 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] after:content-[''] after:absolute after:top-full after:inset-x-0 after:h-32 after:bg-surface after:pointer-events-none">
        <div className="flex items-center gap-2.5 max-w-xl md:max-w-2xl mx-auto w-full">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-[42px] px-3 text-[length:var(--font-size-body)] font-medium text-on-surface-muted hover:text-on-surface transition-colors shrink-0"
            >
              Cancel
            </button>
          )}
          {onSaveAndAddAnother && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onSaveAndAddAnother}
              className="min-h-[44px] flex-1 rounded-2xl border border-brand-accent/40 bg-surface-container-low px-3 text-xs sm:text-[length:var(--font-size-body)] font-semibold text-brand-accent disabled:opacity-50 hover:bg-surface-container transition-all"
            >
              Save & add another
            </button>
          )}
          <RippleButton
            id="tour-save-product"
            type="submit"
            disabled={isSubmitting}
            className="min-h-[44px] flex-1 rounded-2xl bg-brand-accent px-4 text-xs sm:text-[length:var(--font-size-body)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:brightness-105 active:scale-[0.99] transition-all"
          >
            {isSubmitting ? "Saving…" : "Save product"}
          </RippleButton>
        </div>
      </div>
    </form>
  );
}
