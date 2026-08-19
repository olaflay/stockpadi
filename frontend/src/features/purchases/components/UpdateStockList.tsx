import { Search } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { NoResultsState } from "@/components/ui/NoResultsState";
import { ShortDateInput } from "@/components/ui/ShortDateInput";
import { RippleButton } from "@/components/ui/Ripple";
import type { Product } from "@/types/product";
import type { RowState } from "@/features/purchases/use-update-stock";

const inputClass =
  "min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 text-[length:var(--font-size-body)] text-on-surface";

export function UpdateStockList({
  onBack,
  query,
  onQueryChange,
  filtered,
  rowFor,
  isDirty,
  updateRow,
  dirtyProducts,
  isSaving,
  onSave,
}: {
  onBack: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  filtered: Product[];
  rowFor: (product: Product) => RowState;
  isDirty: (product: Product) => boolean;
  updateRow: (product: Product, changes: Partial<RowState>) => void;
  dirtyProducts: Product[];
  isSaving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 pb-24">
      <ScreenHeader title="Update stock" onBack={onBack} />

      <div className="relative w-full">
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by name or SKU"
          className={`${inputClass} pl-10`}
        />
      </div>

      {filtered.length === 0 ? (
        <NoResultsState query={query} />
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((product) => {
            const row = rowFor(product);
            const dirty = isDirty(product);
            return (
              <li
                key={product.id}
                className={`rounded-[var(--radius-card)] border p-4 transition-colors ${
                  dirty ? "border-brand-accent bg-brand-accent/5" : "border-border bg-surface"
                }`}
              >
                <input
                  value={row.name}
                  onChange={(event) => updateRow(product, { name: event.target.value })}
                  aria-label={`Name for ${product.name}`}
                  className="w-full bg-transparent text-[length:var(--font-size-body-lg)] font-medium text-on-surface focus:outline-none"
                />

                <label className="mt-3 flex flex-col gap-1">
                  <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Stock</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.stock}
                    onChange={(event) => updateRow(product, { stock: event.target.value })}
                    className={`${inputClass} text-[length:var(--font-size-title)] font-semibold`}
                  />
                </label>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Price</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.sellPrice}
                      onChange={(event) => updateRow(product, { sellPrice: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[length:var(--font-size-label)] text-on-surface-muted">Expiry date</span>
                    <ShortDateInput
                      value={row.expiryDate}
                      onChange={(isoDate) => updateRow(product, { expiryDate: isoDate })}
                      className="w-full"
                    />
                  </label>
                </div>

                <label className="mt-3 flex flex-col gap-1">
                  <span className="text-[length:var(--font-size-label)] text-on-surface-muted">SKU</span>
                  <input
                    value={row.sku}
                    onChange={(event) => updateRow(product, { sku: event.target.value })}
                    className={inputClass}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed bottom-16 left-0 right-0 z-10 border-t border-border bg-surface px-4 py-3">
        <RippleButton
          type="button"
          onClick={onSave}
          disabled={isSaving || dirtyProducts.length === 0}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body)] font-medium text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          {isSaving
            ? "Saving…"
            : dirtyProducts.length > 0
              ? `Save ${dirtyProducts.length} change${dirtyProducts.length === 1 ? "" : "s"}`
              : "Save"}
        </RippleButton>
      </div>
    </div>
  );
}
