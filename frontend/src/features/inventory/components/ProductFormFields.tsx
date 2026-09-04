import { useState } from "react";
import dynamic from "next/dynamic";
import { Layers, Camera } from "lucide-react";
import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";

// Loaded on demand — see the matching comment in
// src/features/pos/components/BrowseStep.tsx.
const BarcodeScanner = dynamic(() => import("@/components/ui/BarcodeScanner").then((m) => m.BarcodeScanner), {
  ssr: false,
});
import { SelectInput } from "@/components/ui/SelectInput";
import { ShortDateInput } from "@/components/ui/ShortDateInput";
import { CategoryAutocomplete, type CategoryOption } from "@/components/ui/CategoryAutocomplete";
import { getRecentCategoryIds } from "@/lib/last-used-category";
import type { ProductFormInput, ProductFormValues } from "@/features/inventory/product-schema";
import { TextInput } from "@/components/ui/TextInput";

/**
 * Shared red caption under a control, wired to that control's aria-describedby
 * (a TextInput/SelectInput errorId) so screen readers announce it together
 * with the invalid field.
 */
function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <span id={id} role="alert" className="text-[length:var(--font-size-caption)] text-danger">
      {error}
    </span>
  );
}

/** Shared by the Add Product screen's own Starting stock / branch fields. */
export { FieldError };

/** Name, category, SKU/barcode, and cost/sell price — identical in Add and Edit Product. */
export function ProductCoreFields({
  register,
  setValue,
  errors,
  categories,
  categoryId,
  categoryInputName,
  onCategorySelect,
  autoFocusName,
  onNameChange,
  onSkuChange,
}: {
  register: UseFormRegister<ProductFormInput>;
  errors: FieldErrors<ProductFormInput>;
  categories: CategoryOption[] | undefined;
  categoryId: string;
  categoryInputName: string;
  onCategorySelect: (id: string, name: string) => void;
  autoFocusName?: boolean;
  /** Called on each name keystroke so the form can live-auto-fill the SKU. */
  onNameChange?: (value: string) => void;
  /** Called when the user edits the SKU so auto-fill can step aside. */
  onSkuChange?: (value: string) => void;
  setValue: UseFormSetValue<ProductFormInput>;
}) {
  const [scanning, setScanning] = useState(false);
  const nameRegister = register("name");
  const skuRegister = register("sku");

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Name *</span>
        <TextInput
          {...nameRegister}
          onChange={(e) => {
            nameRegister.onChange(e);
            onNameChange?.(e.target.value);
          }}
          placeholder="e.g. Indomie Instant Noodles"
          autoFocus={autoFocusName}
          hasError={Boolean(errors.name)}
          errorId="field-error-name"
        />
        <FieldError id="field-error-name" error={errors.name?.message} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Category</span>
        <CategoryAutocomplete
          categories={categories ?? []}
          recentIds={getRecentCategoryIds()}
          value={categoryId}
          valueName={categories?.find((c) => c.id === categoryId)?.name ?? categoryInputName}
          onSelect={onCategorySelect}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">SKU (optional)</span>
          <TextInput
            {...skuRegister}
            onChange={(e) => {
              skuRegister.onChange(e);
              onSkuChange?.(e.target.value);
            }}
            placeholder="e.g. IND-70G (auto-fills)"
            hasError={Boolean(errors.sku)}
            errorId="field-error-sku"
          />
          <FieldError id="field-error-sku" error={errors.sku?.message} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Barcode</span>
          <div className="flex gap-2">
            <TextInput
              {...register("barcode")}
              placeholder="optional"
              className="flex-1 min-w-0"
              hasError={Boolean(errors.barcode)}
              errorId="field-error-barcode"
            />
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label="Scan barcode"
              className="flex min-h-[var(--touch-target-min)] w-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface text-on-surface hover:bg-surface-container transition-colors"
            >
              <Camera size={18} aria-hidden />
            </button>
          </div>
          <FieldError id="field-error-barcode" error={errors.barcode?.message} />
        </label>
      </div>
      
      {scanning && (
        <BarcodeScanner
          onResult={(res) => {
            setValue("barcode", res, { shouldDirty: true, shouldValidate: true });
            setScanning(false);
          }}
          onCancel={() => setScanning(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Cost price *</span>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            {...register("costPrice")}
            placeholder="₦0.00"
            hasError={Boolean(errors.costPrice)}
            errorId="field-error-cost-price"
          />
          <FieldError id="field-error-cost-price" error={errors.costPrice?.message} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Sell price *</span>
          <TextInput
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            {...register("sellPrice")}
            placeholder="₦0.00"
            hasError={Boolean(errors.sellPrice)}
            errorId="field-error-sell-price"
          />
          <FieldError id="field-error-sell-price" error={errors.sellPrice?.message} />
        </label>
      </div>
    </>
  );
}

/** The standalone "Stock alert" input, reused (differently laid out) by both screens. */
export function ProductStockAlertField({
  register,
  errors,
  placeholder,
}: {
  register: UseFormRegister<ProductFormInput>;
  errors: FieldErrors<ProductFormInput>;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Stock alert *</span>
      <TextInput
        type="number"
        min="0"
        inputMode="numeric"
        {...register("lowStockThreshold")}
        placeholder={placeholder}
        hasError={Boolean(errors.lowStockThreshold)}
        errorId="field-error-low-stock-threshold"
      />
      <FieldError id="field-error-low-stock-threshold" error={errors.lowStockThreshold?.message} />
    </label>
  );
}

/** The unit-conversion toggle + its collapsible block — identical in Add and Edit Product. */
export function ProductUnitConversionFields({
  register,
  errors,
  showUnitConversion,
  onToggleUnitConversion,
  unitLabel,
  altUnitLabel,
}: {
  register: UseFormRegister<ProductFormInput>;
  errors: FieldErrors<ProductFormInput>;
  showUnitConversion: boolean;
  onToggleUnitConversion: () => void;
  unitLabel: string;
  altUnitLabel: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-border px-4 py-3">
        <span className="text-[length:var(--font-size-body)] text-on-surface">
          {showUnitConversion ? "Selling in more than one unit" : "Just one unit for this product"}
        </span>
        <button
          type="button"
          onClick={onToggleUnitConversion}
          aria-expanded={showUnitConversion}
          aria-controls="unit-conversion-panel"
          className="flex items-center gap-1.5 text-[length:var(--font-size-body)] font-medium text-brand-accent"
        >
          <Layers size={16} aria-hidden />
          {showUnitConversion ? "Hide" : "Advanced"}
        </button>
      </div>

      {showUnitConversion && (
        <div id="unit-conversion-panel" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface-container p-4">
          <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
            For when you sell the same stock two ways — e.g. by the piece, but also by the carton. Leave the
            second unit blank if that&apos;s not you.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
              What unit is the price above for? *
            </span>
            <TextInput
              {...register("unitLabel")}
              placeholder="e.g. piece, kg, bag"
              hasError={Boolean(errors.unitLabel)}
              errorId="field-error-unit-label"
            />
            <FieldError id="field-error-unit-label" error={errors.unitLabel?.message} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
              Also sold as a bigger unit? (optional)
            </span>
            <TextInput {...register("altUnitLabel")} placeholder="e.g. carton, dozen, bag" />
          </label>

          {altUnitLabel.trim() && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
                  1 {altUnitLabel} = how many {unitLabel}? *
                </span>
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  {...register("altUnitConversionFactor")}
                  placeholder="e.g. 24"
                  hasError={Boolean(errors.altUnitConversionFactor)}
                  errorId="field-error-alt-unit-factor"
                />
                <FieldError id="field-error-alt-unit-factor" error={errors.altUnitConversionFactor?.message} />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
                  Price for one whole {altUnitLabel} *
                </span>
                <TextInput
                  type="number"
                  min="0"
                  step="0.01"
                  {...register("altUnitSellPrice")}
                  placeholder="0.00"
                  hasError={Boolean(errors.altUnitSellPrice)}
                  errorId="field-error-alt-unit-price"
                />
                <FieldError id="field-error-alt-unit-price" error={errors.altUnitSellPrice?.message} />
              </label>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Expiry tracking mode + conditional date — identical in Add and Edit Product. */
export function ProductExpiryFields({
  register,
  errors,
  control,
  expiryTracking,
}: {
  register: UseFormRegister<ProductFormInput>;
  errors: FieldErrors<ProductFormInput>;
  control: Control<ProductFormInput, unknown, ProductFormValues>;
  expiryTracking: ProductFormInput["expiryTracking"];
}) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Expiry tracking</span>
        <SelectInput {...register("expiryTracking")}>
          <option value="off">Off</option>
          <option value="optional">Optional</option>
          <option value="mandatory">Mandatory</option>
        </SelectInput>
      </label>

      {expiryTracking !== "off" && (
        <label className="flex flex-col gap-1">
          <span className="text-[length:var(--font-size-label)] text-on-surface-muted">
            Expiry date {expiryTracking === "mandatory" ? "*" : "(optional)"}
          </span>
          <Controller
            name="expiryDate"
            control={control}
            render={({ field }) => <ShortDateInput value={field.value ?? ""} onChange={field.onChange} />}
          />
          {errors.expiryDate && (
            <span className="text-[length:var(--font-size-caption)] text-danger">{errors.expiryDate.message}</span>
          )}
        </label>
      )}
    </>
  );
}
