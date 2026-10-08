import { useState } from "react";
import dynamic from "next/dynamic";
import { Camera } from "lucide-react";
import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue, type UseFormWatch } from "react-hook-form";

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
import { formatCurrency } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useToast } from "@/components/ui/Toast";
import { deleteCategoryOffline } from "@/features/inventory/category-offline-delete";

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
  watch,
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
  setValue: UseFormSetValue<ProductFormInput>;
  watch?: UseFormWatch<ProductFormInput>;
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
}) {
  const [scanning, setScanning] = useState(false);
  const user = useCurrentUser();
  const { showToast } = useToast();

  const handleDeleteCategory = async (catId: string) => {
    try {
      await deleteCategoryOffline(catId, user);
      showToast("Category deleted", "success");
    } catch {
      showToast("Could not delete category", "danger");
    }
  };

  const nameRegister = register("name");
  const skuRegister = register("sku");

  const watchedCost = watch ? watch("costPrice") : undefined;
  const watchedSell = watch ? watch("sellPrice") : undefined;
  const costNum = parseFloat(String(watchedCost ?? "0"));
  const sellNum = parseFloat(String(watchedSell ?? "0"));
  const hasPrices = !isNaN(costNum) && !isNaN(sellNum) && (costNum > 0 || sellNum > 0);
  const profit = sellNum - costNum;
  const margin = sellNum > 0 ? (profit / sellNum) * 100 : 0;

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Name *</span>
        <TextInput
          id="field-product-name"
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
          onDeleteCategory={handleDeleteCategory}
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
            SKU (optional)
            <InfoTooltip text="Stock Keeping Unit. Auto-filled from name, or enter your custom code." />
          </span>
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
          <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
            Barcode
            <InfoTooltip text="Optional barcode. No barcode? That's fine — you can leave this blank." />
          </span>
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
        <label className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-start gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
            Cost price *
            <InfoTooltip text="What you paid to purchase or manufacture one unit." />
          </span>
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

        <label className="flex min-w-0 flex-col gap-1">
          <span className="flex min-w-0 items-start gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
            Sell price *
            <InfoTooltip text="The retail price your customers pay." />
          </span>
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

      {hasPrices && (
        <div className="flex items-center justify-between rounded-xl bg-surface-container px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-muted">Profit per unit:</span>
            <span className={`font-bold font-number ${profit >= 0 ? "text-success" : "text-danger"}`}>
              {formatCurrency(profit)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-on-surface-muted">Margin:</span>
            <span className={`font-bold font-number ${margin >= 0 ? "text-success" : "text-danger"}`}>
              {Math.round(margin)}%
            </span>
          </div>
        </div>
      )}
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
    <label className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-start gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
        Low-stock alert
        <InfoTooltip text={`Notify me when stock drops to or below ${placeholder || "5"} units.`} />
      </span>
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
  altUnitLabel,
}: {
  register: UseFormRegister<ProductFormInput>;
  errors: FieldErrors<ProductFormInput>;
  showUnitConversion: boolean;
  onToggleUnitConversion: () => void;
  unitLabel?: string;
  altUnitLabel: string;
}) {
  const displayAlt = altUnitLabel?.trim();

  return (
    <div className="flex flex-col rounded-2xl bg-surface-container border border-border/30 overflow-hidden">
      {/* Banner / Toggle Card — Streamlined to minimal footprint */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-semibold text-on-surface truncate">
            Pack / carton pricing
          </p>
          <InfoTooltip text="Sell single items (e.g. bottle) and bulk packs (e.g. carton/crate) with automatic stock deduction." />
        </div>

        <button
          type="button"
          onClick={onToggleUnitConversion}
          aria-expanded={showUnitConversion}
          aria-controls="unit-conversion-panel"
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
            showUnitConversion
              ? "bg-danger/10 text-danger hover:bg-danger/20"
              : "bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/25 active:scale-95"
          }`}
        >
          {showUnitConversion ? "Remove" : "+ Add pack"}
        </button>
      </div>

      {/* Expanded Compact Form */}
      {showUnitConversion && (
        <div
          id="unit-conversion-panel"
          className="flex flex-col gap-3 border-t border-border/20 bg-surface-container-low/40 p-3.5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Single Item Unit Label */}
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                Single unit name *
                <InfoTooltip text="e.g. piece, bottle, sachet" />
              </span>
              <TextInput
                {...register("unitLabel")}
                placeholder="piece, bottle, etc."
                hasError={Boolean(errors.unitLabel)}
                errorId="field-error-unit-label"
              />
              <FieldError id="field-error-unit-label" error={errors.unitLabel?.message} />
            </label>

            {/* Bulk Pack Unit Label */}
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                Pack name
                <InfoTooltip text="e.g. carton, crate, roll, bag" />
              </span>
              <TextInput
                {...register("altUnitLabel")}
                placeholder="carton, crate, etc."
              />
            </label>
          </div>

          {displayAlt && (
            <div className="flex flex-col gap-3 rounded-xl bg-surface-container p-3 border border-border/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Quantity in Pack */}
                <label className="flex flex-col gap-1">
                  <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                    Qty in 1 {displayAlt} *
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

                {/* Selling Price for Pack */}
                <label className="flex flex-col gap-1">
                  <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                    {displayAlt} selling price *
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
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
        <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
          Expiry tracking
          <InfoTooltip text="Track expiration dates for perishables and receive warnings before items expire." />
        </span>
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
            render={({ field }) => (
              <ShortDateInput
                value={field.value ?? ""}
                onChange={field.onChange}
                autoFocus={true}
              />
            )}
          />
          {errors.expiryDate && (
            <span className="text-[length:var(--font-size-caption)] text-danger">{errors.expiryDate.message}</span>
          )}
        </label>
      )}
    </>
  );
}
