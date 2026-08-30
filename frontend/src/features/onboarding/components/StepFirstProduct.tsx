"use client";

import { FirstProductDraft } from "../types";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { TextInput } from "@/components/ui/TextInput";
import { RippleButton } from "@/components/ui/Ripple";
import { TrendingUp, Sparkles } from "lucide-react";

interface StepFirstProductProps {
  firstProduct: FirstProductDraft;
  onChangeFirstProduct: (product: FirstProductDraft) => void;
  businessTypeId: string;
  onNext: () => void;
}

export function StepFirstProduct({
  firstProduct,
  onChangeFirstProduct,
  businessTypeId,
  onNext,
}: StepFirstProductProps) {
  const currentTemplate =
    BUSINESS_TYPE_TEMPLATES.find((t) => t.id === businessTypeId) || BUSINESS_TYPE_TEMPLATES[0];

  const cost = typeof firstProduct.costPrice === "number" ? firstProduct.costPrice : 0;
  const sell = typeof firstProduct.sellPrice === "number" ? firstProduct.sellPrice : 0;
  const profit = sell > 0 && cost > 0 ? sell - cost : null;
  const marginPercent = sell > 0 && profit !== null ? ((profit / sell) * 100).toFixed(1) : null;

  function handlePrefillSample() {
    const sample = currentTemplate.sampleProducts[0];
    if (sample) {
      onChangeFirstProduct({
        name: sample.name,
        costPrice: sample.costPrice,
        sellPrice: sample.sellPrice,
        unitLabel: sample.unitLabel,
        lowStockThreshold: sample.lowStockThreshold,
      });
    }
  }

  const isValid =
    firstProduct.name.trim().length > 0 &&
    typeof firstProduct.sellPrice === "number" &&
    firstProduct.sellPrice > 0;

  return (
    <div className="flex flex-1 flex-col justify-between">
      {/* Top Header */}
      <div className="flex flex-col items-center pt-4 text-center">
        <p className="text-[length:var(--font-size-label)] font-medium text-brand-accent">
          Step 3 of 4 • First Product
        </p>
        <h1 className="mt-1 text-[length:var(--font-size-title-lg)] font-bold text-on-surface">
          Add your first product
        </h1>
        <p className="mt-1 text-[length:var(--font-size-body)] text-on-surface-muted max-w-xs">
          One item is enough to start ringing up sales at your till.
        </p>
      </div>

      {/* Form Fields & Dynamic Margin Badge */}
      <div className="my-auto flex flex-col gap-4 py-2">
        {/* Sample Prefill Ghost Link */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handlePrefillSample}
            className="inline-flex items-center gap-1.5 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:underline"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Use sample ({currentTemplate.sampleProducts[0]?.name || "Sample item"})
          </button>
        </div>

        {/* Product Name */}
        <label className="flex flex-col gap-1 text-left">
          <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
            Product name
          </span>
          <TextInput
            value={firstProduct.name}
            onChange={(e) =>
              onChangeFirstProduct({ ...firstProduct, name: e.target.value })
            }
            placeholder="e.g. Crate of Eggs or 1L Milk"
            autoFocus
          />
        </label>

        {/* Price Inputs Grid */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-left">
            <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
              Cost price (₦)
            </span>
            <TextInput
              type="number"
              value={firstProduct.costPrice === "" ? "" : firstProduct.costPrice}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : Number(e.target.value);
                onChangeFirstProduct({ ...firstProduct, costPrice: val });
              }}
              placeholder="e.g. 1200"
            />
          </label>

          <label className="flex flex-col gap-1 text-left">
            <span className="text-[length:var(--font-size-label)] font-medium text-on-surface">
              Selling price (₦)
            </span>
            <TextInput
              type="number"
              value={firstProduct.sellPrice === "" ? "" : firstProduct.sellPrice}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : Number(e.target.value);
                onChangeFirstProduct({ ...firstProduct, sellPrice: val });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValid) {
                  e.preventDefault();
                  onNext();
                }
              }}
              placeholder="e.g. 1500"
            />
          </label>
        </div>

        {/* Live Profit Margin Badge (Education / Value reinforcement) */}
        {profit !== null && (
          <div
            className={`flex items-center justify-between rounded-[var(--radius-card)] p-3 text-[length:var(--font-size-caption)] transition-all ${
              profit >= 0
                ? "bg-brand-accent/10 border border-brand-accent/30 text-on-surface"
                : "bg-danger-container text-on-danger-container"
            }`}
          >
            <div className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="h-4 w-4 text-brand-accent" />
              <span>
                {profit >= 0 ? "Profit per unit:" : "Loss per unit:"}{" "}
                <strong>₦{Math.abs(profit).toLocaleString()}</strong>
              </span>
            </div>
            <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-bold">
              {marginPercent}% margin
            </span>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="pb-8">
        <RippleButton
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="min-h-[var(--touch-target-min)] w-full rounded-[var(--radius-control)] bg-brand-accent text-[length:var(--font-size-body-lg)] font-semibold text-brand-accent-contrast disabled:opacity-50 hover:opacity-95 transition-opacity"
        >
          Save Product
        </RippleButton>
      </div>
    </div>
  );
}
