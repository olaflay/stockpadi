import { useState } from "react";
import dynamic from "next/dynamic";
import { Layers, Camera } from "lucide-react";
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
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
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

        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
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
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-on-surface-muted">
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
  const displayUnit = unitLabel?.trim() || "piece";
  const displayAlt = altUnitLabel?.trim();

  return (
    <div className="flex flex-col rounded-2xl bg-surface-container border border-border/30 overflow-hidden">
      {/* Banner / Toggle Card */}
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-container text-on-brand-container">
            <Layers size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-on-surface">
              Sell in cartons, crates, or packs?
            </p>
            <p className="text-xs text-on-surface-muted mt-0.5">
              Sell both single items (e.g. bottle) and bulk packs (e.g. crate)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleUnitConversion}
          aria-expanded={showUnitConversion}
          aria-controls="unit-conversion-panel"
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            showUnitConversion
              ? "bg-danger/10 text-danger hover:bg-danger/20"
              : "bg-brand-accent text-brand-accent-contrast shadow-xs hover:opacity-90 active:scale-95"
          }`}
        >
          {showUnitConversion ? "Remove pack pricing" : "+ Add pack pricing"}
        </button>
      </div>

      {/* Expanded Friendly Form */}
      {showUnitConversion && (
        <div
          id="unit-conversion-panel"
          className="flex flex-col gap-4 border-t border-border/20 bg-surface-container-low/50 p-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Single Item Unit Label */}
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                Single item name *
              </span>
              <TextInput
                {...register("unitLabel")}
                placeholder="e.g. piece, bottle, sachet"
                hasError={Boolean(errors.unitLabel)}
                errorId="field-error-unit-label"
              />
              <span className="text-[11px] text-on-surface-muted">
                Name of 1 single item for the price above
              </span>
              <FieldError id="field-error-unit-label" error={errors.unitLabel?.message} />
            </label>

            {/* Bulk Pack Unit Label */}
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                Pack or bulk name
              </span>
              <TextInput
                {...register("altUnitLabel")}
                placeholder="e.g. carton, crate, roll, bag"
              />
              <span className="text-[11px] text-on-surface-muted">
                Name of the larger box or wholesale pack
              </span>
            </label>
          </div>

          {displayAlt && (
            <div className="flex flex-col gap-3 rounded-xl bg-surface-container p-3.5 border border-border/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Quantity in Pack */}
                <label className="flex flex-col gap-1">
                  <span className="text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
                    How many {displayUnit}s in 1 {displayAlt}? *
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
                    Selling price for 1 whole {displayAlt} *
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

              {/* Informational Guidance */}
              <div className="rounded-lg bg-brand-accent/5 p-2.5 text-[11px] text-on-surface-muted">
                💡 <strong className="text-on-surface">At checkout:</strong> Cashiers can tap either <span className="font-semibold text-brand-accent">1 {displayUnit}</span> or <span className="font-semibold text-brand-accent">1 {displayAlt}</span>. Inventory will automatically deduct accurately.
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
