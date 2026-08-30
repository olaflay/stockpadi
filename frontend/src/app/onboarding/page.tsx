"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, BUSINESS_PROFILE_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft } from "lucide-react";
import {
  OnboardingStep,
  OnboardingState,
  FirstProductDraft,
} from "@/features/onboarding/types";
import {
  StepTrustMarketing,
  StepBusinessType,
  StepFirstProduct,
  StepEducationSuperpowers,
} from "@/features/onboarding/components";

const STEPS: OnboardingStep[] = [
  "marketing",
  "business_type",
  "first_product",
  "education",
];

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [checking, setChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<OnboardingStep>("marketing");

  const [state, setState] = useState<OnboardingState>({
    businessName: "",
    businessTypeId: BUSINESS_TYPE_TEMPLATES[0].id,
    loadStarterPack: true,
    firstProduct: {
      name: "",
      costPrice: "",
      sellPrice: "",
      unitLabel: "piece",
      lowStockThreshold: 5,
    },
  });

  useEffect(() => {
    async function init() {
      const profile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
      const productCount = await db.products.count();
      const saleCount = await db.sales.count();

      // Only skip onboarding if user already configured inventory or started selling
      if (profile && (productCount > 0 || saleCount > 0)) {
        router.replace("/dashboard");
      } else {
        if (profile?.name) {
          setState((prev) => ({
            ...prev,
            businessName: profile.name,
            businessTypeId: profile.businessTypeId || prev.businessTypeId,
          }));
        }
        setChecking(false);
      }
    }
    void init();
  }, [router]);

  const currentStepIndex = STEPS.indexOf(step);

  function handleBack() {
    if (currentStepIndex > 0) {
      setStep(STEPS[currentStepIndex - 1]);
    }
  }

  async function handleFinish(destination: "/pos" | "/dashboard" = "/pos") {
    setIsSaving(true);
    const template =
      BUSINESS_TYPE_TEMPLATES.find((t) => t.id === state.businessTypeId) ||
      BUSINESS_TYPE_TEMPLATES[0];

    const branchId = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await db.transaction(
        "rw",
        db.businessProfile,
        db.categories,
        db.branches,
        db.products,
        db.stockMovements,
        async () => {
          // 1. Business Profile
          await db.businessProfile.put({
            id: BUSINESS_PROFILE_SINGLETON_ID,
            name: state.businessName.trim() || "My Retail Shop",
            businessTypeId: template.id,
            currency: "NGN",
          });

          // 2. Categories
          const categoryRecords = template.defaultCategories.map((name) => ({
            id: crypto.randomUUID(),
            name,
          }));
          await db.categories.bulkPut(categoryRecords);
          const defaultCategoryId = categoryRecords[0]?.id || null;

          // 3. Main Branch
          await db.branches.add({
            id: branchId,
            name: "Main branch",
            isActive: true,
          });

          // 4. Starter Pack Products (if enabled)
          if (state.loadStarterPack && template.sampleProducts.length > 0) {
            for (const sample of template.sampleProducts) {
              const productId = crypto.randomUUID();
              await db.products.put({
                id: productId,
                sku: sample.sku,
                barcode: null,
                name: sample.name,
                categoryId: defaultCategoryId,
                brandId: null,
                unitLabel: sample.unitLabel,
                altUnitLabel: null,
                altUnitConversionFactor: null,
                altUnitSellPrice: null,
                costPrice: sample.costPrice,
                sellPrice: sample.sellPrice,
                expiryTracking: template.expiryTracking,
                expiryDate: null,
                lowStockThreshold: sample.lowStockThreshold,
                version: 1,
                updatedAt: now,
              });

              // Initial stock movement
              await db.stockMovements.put({
                id: crypto.randomUUID(),
                clientId: crypto.randomUUID(),
                branchId,
                productId,
                quantityDelta: 20,
                source: "initial_stock",
                sourceReferenceId: null,
                reasonCode: null,
                createdAtLocal: now,
                createdAt: now,
                createdByUserId: "owner",
              });
            }
          }

          // 5. Custom First Product (if added)
          if (
            state.firstProduct.name.trim() &&
            typeof state.firstProduct.sellPrice === "number" &&
            state.firstProduct.sellPrice > 0
          ) {
            const firstProdId = crypto.randomUUID();
            await db.products.put({
              id: firstProdId,
              sku: "PROD-001",
              barcode: null,
              name: state.firstProduct.name.trim(),
              categoryId: defaultCategoryId,
              brandId: null,
              unitLabel: state.firstProduct.unitLabel || "piece",
              altUnitLabel: null,
              altUnitConversionFactor: null,
              altUnitSellPrice: null,
              costPrice:
                typeof state.firstProduct.costPrice === "number"
                  ? state.firstProduct.costPrice
                  : 0,
              sellPrice: state.firstProduct.sellPrice,
              expiryTracking: "off",
              expiryDate: null,
              lowStockThreshold: state.firstProduct.lowStockThreshold || 5,
              version: 1,
              updatedAt: now,
            });

            await db.stockMovements.put({
              id: crypto.randomUUID(),
              clientId: crypto.randomUUID(),
              branchId,
              productId: firstProdId,
              quantityDelta: 10,
              source: "initial_stock",
              sourceReferenceId: null,
              reasonCode: null,
              createdAtLocal: now,
              createdAt: now,
              createdByUserId: "owner",
            });
          }
        }
      );

      showToast("Shop setup complete. Ready to sell offline.", "success");
      router.push(destination);
    } catch (err) {
      console.error("Failed to complete onboarding:", err);
      showToast("Failed to save settings. Please try again.", "danger");
      setIsSaving(false);
    }
  }

  async function handleSkip() {
    setIsSaving(true);
    const template =
      BUSINESS_TYPE_TEMPLATES.find((t) => t.id === "general_retail") ||
      BUSINESS_TYPE_TEMPLATES[0];

    try {
      await db.transaction(
        "rw",
        db.businessProfile,
        db.categories,
        db.branches,
        async () => {
          await db.businessProfile.put({
            id: BUSINESS_PROFILE_SINGLETON_ID,
            name: state.businessName.trim() || "My Retail Shop",
            businessTypeId: template.id,
            currency: "NGN",
          });
          await db.categories.bulkPut(
            template.defaultCategories.map((name) => ({
              id: crypto.randomUUID(),
              name,
            }))
          );
          await db.branches.add({
            id: crypto.randomUUID(),
            name: "Main branch",
            isActive: true,
          });
        }
      );

      showToast("Setup skipped. You can configure products anytime.", "success");
      router.push("/dashboard");
    } catch (err) {
      console.error("Failed to skip onboarding:", err);
      setIsSaving(false);
    }
  }

  if (checking) {
    return (
      <div className="flex h-screen w-full flex-col px-6 max-w-md mx-auto justify-center gap-4">
        <Skeleton className="h-10 w-48 mx-auto" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full max-w-md mx-auto flex-col px-6 relative bg-surface">
      {/* Top Header Chrome (One UI / Minimalist M3) */}
      <div className="flex items-center justify-between pt-6 pb-2 min-h-[48px]">
        {currentStepIndex > 0 ? (
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center h-9 w-9 rounded-full text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-9" />
        )}

        {/* Discreet Progress Dots */}
        <div
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-label={`Step ${currentStepIndex + 1} of ${STEPS.length}`}
          className="flex items-center gap-1.5"
        >
          {STEPS.map((s, idx) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentStepIndex
                  ? "w-6 bg-brand-accent"
                  : idx < currentStepIndex
                  ? "w-2 bg-brand-accent/40"
                  : "w-2 bg-surface-container-highest"
              }`}
            />
          ))}
        </div>

        {/* Skip Action */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={isSaving}
          className="text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:underline px-2 py-1"
        >
          Skip
        </button>
      </div>

      {/* Step Views */}
      {step === "marketing" && (
        <StepTrustMarketing
          businessName={state.businessName}
          onChangeBusinessName={(val) =>
            setState((prev) => ({ ...prev, businessName: val }))
          }
          onNext={() => setStep("business_type")}
        />
      )}

      {step === "business_type" && (
        <StepBusinessType
          selectedId={state.businessTypeId}
          onSelectId={(id) =>
            setState((prev) => ({ ...prev, businessTypeId: id }))
          }
          loadStarterPack={state.loadStarterPack}
          onToggleStarterPack={(val) =>
            setState((prev) => ({ ...prev, loadStarterPack: val }))
          }
          onNext={() => setStep("first_product")}
        />
      )}

      {step === "first_product" && (
        <StepFirstProduct
          firstProduct={state.firstProduct}
          onChangeFirstProduct={(prod: FirstProductDraft) =>
            setState((prev) => ({ ...prev, firstProduct: prod }))
          }
          businessTypeId={state.businessTypeId}
          onNext={() => setStep("education")}
        />
      )}

      {step === "education" && (
        <StepEducationSuperpowers
          onComplete={handleFinish}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
