"use client";

import { BUSINESS_TYPE_TEMPLATES, BusinessTypeTemplate } from "@/config/business-types";
import { RippleButton } from "@/components/ui/Ripple";
import { CheckCircle2, Sparkles, Package, ShoppingBag, Shirt, HeartPulse, Smartphone, Hammer } from "lucide-react";

interface StepBusinessTypeProps {
  selectedId: string;
  onSelectId: (id: string) => void;
  loadStarterPack: boolean;
  onToggleStarterPack: (val: boolean) => void;
  onNext: () => void;
}

const TEMPLATE_ICONS: Record<string, typeof ShoppingBag> = {
  retail: ShoppingBag,
  fashion: Shirt,
  health: HeartPulse,
  beauty: Sparkles,
  gadgets: Smartphone,
  materials: Hammer,
};

export function StepBusinessType({
  selectedId,
  onSelectId,
  loadStarterPack,
  onToggleStarterPack,
  onNext,
}: StepBusinessTypeProps) {
  const currentTemplate =
    BUSINESS_TYPE_TEMPLATES.find((t) => t.id === selectedId) || BUSINESS_TYPE_TEMPLATES[0];

  return (
    <div className="flex flex-1 flex-col justify-between">
      {/* Top Header */}
      <div className="flex flex-col items-center pt-4 text-center">
        <p className="text-[length:var(--font-size-label)] font-medium text-brand-accent">
          Step 2 of 4 • Business Type
        </p>
        <h1 className="mt-1 text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
          What type of shop do you run?
        </h1>
        <p className="mt-1 text-[length:var(--font-size-body)] text-on-surface-muted max-w-xs">
          StockPadi configures your units, categories, and inventory settings to match.
        </p>
      </div>

      {/* Vertical Chips / Cards */}
      <div className="my-auto flex flex-col gap-4 py-3">
        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Business types">
          {BUSINESS_TYPE_TEMPLATES.map((template: BusinessTypeTemplate) => {
            const isSelected = selectedId === template.id;
            const Icon = TEMPLATE_ICONS[template.id] || ShoppingBag;
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectId(template.id)}
                className={`flex min-h-[var(--touch-target-min)] flex-col justify-between rounded-[var(--radius-card)] border-2 p-3 text-left transition-all ${
                  isSelected
                    ? "border-brand-accent bg-brand-accent/8 shadow-sm"
                    : "border-transparent bg-surface-container hover:bg-surface-container-high"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon className={`h-4 w-4 shrink-0 ${isSelected ? "text-brand-accent" : "text-on-surface-muted"}`} aria-hidden />
                      <span className="truncate text-[length:var(--font-size-body)] font-semibold text-on-surface">
                        {template.label}
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-brand-accent shrink-0" />
                    )}
                  </div>
                  <span className="mt-1.5 line-clamp-2 text-[length:var(--font-size-caption)] text-on-surface-muted">
                    {template.notes}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Starter Catalog Value Proposition (Sales conversion trigger) */}
        <div className="rounded-[var(--radius-card)] border border-brand-accent/20 bg-brand-accent/5 p-3.5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={loadStarterPack}
              onChange={(e) => onToggleStarterPack(e.target.checked)}
              className="mt-1 h-4 w-4 rounded accent-brand-accent"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-medium text-[length:var(--font-size-body)] text-on-surface">
                <Sparkles className="h-4 w-4 text-brand-accent" />
                <span>Preload 3 sample starter products</span>
              </div>
              <p className="text-[length:var(--font-size-caption)] text-on-surface-muted mt-0.5">
                Adds verified items for {currentTemplate.label} so you can test selling instantly.
              </p>
              {loadStarterPack && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {currentTemplate.sampleProducts.map((p) => (
                    <span
                      key={p.sku}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] font-medium text-on-surface"
                    >
                      <Package className="h-3 w-3 text-brand-accent" />
                      {p.name} (₦{p.sellPrice.toLocaleString()})
                    </span>
                  ))}
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* Bottom CTA Button */}
      <div className="pb-8">
        <RippleButton
          type="button"
          onClick={onNext}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast hover:opacity-95 transition-opacity"
        >
          Save & Next
        </RippleButton>
      </div>
    </div>
  );
}
