"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db, BUSINESS_PROFILE_SINGLETON_ID, SESSION_SINGLETON_ID } from "@/lib/db";
import { BUSINESS_TYPE_TEMPLATES } from "@/config/business-types";
import { useToast } from "@/components/ui/Toast";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { enqueueOutboxWrite } from "@/features/sync/enqueue-outbox-write";
import { getLocalBusinessId, tenantArray } from "@/lib/local-tenant";
import type { Product } from "@/types/product";
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
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

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
      const session = await db.session.get(SESSION_SINGLETON_ID);

      if (session?.userId) {
        const localUser = await db.localUsers.get(session.userId);
        setEmailVerified(localUser?.emailVerified ?? false);
      } else {
        setEmailVerified(null);
      }

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

    const now = new Date().toISOString();

    try {
      const existingProfile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
      const session = await db.session.get(SESSION_SINGLETON_ID);
      const user = session?.userId ? await db.localUsers.get(session.userId) : null;
      const businessId = existingProfile?.businessId ?? user?.businessId ?? (await getLocalBusinessId());

      const existingBranches = await tenantArray(db.branches);
      const branchId = existingBranches[0]?.id || crypto.randomUUID();

      await db.transaction(
        "rw",
        [
          db.businessProfile,
          db.categories,
          db.branches,
          db.products,
          db.stockMovements,
          db.outbox,
        ],
        async () => {
          // 1. Business Profile (Preserves businessId for multi-device sync)
          await db.businessProfile.put({
            id: BUSINESS_PROFILE_SINGLETON_ID,
            businessId,
            name: state.businessName.trim() || "My Retail Shop",
            businessTypeId: template.id,
            currency: "NGN",
          });

          // 2. Categories
          const categoryRecords = template.defaultCategories.map((name) => ({
            id: crypto.randomUUID(),
            businessId,
            name,
          }));
          await db.categories.bulkPut(categoryRecords);
          const defaultCategoryId = categoryRecords[0]?.id || null;

          // 3. Main Branch (Only create if no branch exists yet; reuse registered branch)
          if (existingBranches.length === 0) {
            await db.branches.add({
              id: branchId,
              businessId,
              name: "Main branch",
              isActive: true,
            });
          }

          // 4. Starter Pack Products (if enabled) — queued to outbox for cloud sync
          if (state.loadStarterPack && template.sampleProducts.length > 0) {
            for (const sample of template.sampleProducts) {
              const productId = crypto.randomUUID();
              const product: Product = {
                id: productId,
                businessId,
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
              };
              await db.products.put(product);
              await enqueueOutboxWrite(productId, "product", product, now);

              // Initial stock movement
              const movementId = crypto.randomUUID();
              const movement = {
                id: movementId,
                clientId: movementId,
                businessId,
                branchId,
                productId,
                quantityDelta: 20,
                source: "initial_stock" as const,
                sourceReferenceId: null,
                reasonCode: "initial_stock" as const,
                createdAtLocal: now,
                createdAt: now,
                createdByUserId: user?.id || "owner",
              };
              await db.stockMovements.put(movement);
              await enqueueOutboxWrite(movementId, "stock_adjustment", movement, now);
            }
          }

          // 5. Custom First Product (if added) — queued to outbox for cloud sync
          if (
            state.firstProduct.name.trim() &&
            typeof state.firstProduct.sellPrice === "number" &&
            state.firstProduct.sellPrice > 0
          ) {
            const firstProdId = crypto.randomUUID();
            const firstProduct: Product = {
              id: firstProdId,
              businessId,
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
            };
            await db.products.put(firstProduct);
            await enqueueOutboxWrite(firstProdId, "product", firstProduct, now);

            const firstMovementId = crypto.randomUUID();
            const firstMovement = {
              id: firstMovementId,
              clientId: firstMovementId,
              businessId,
              branchId,
              productId: firstProdId,
              quantityDelta: 10,
              source: "initial_stock" as const,
              sourceReferenceId: null,
              reasonCode: "initial_stock" as const,
              createdAtLocal: now,
              createdAt: now,
              createdByUserId: user?.id || "owner",
            };
            await db.stockMovements.put(firstMovement);
            await enqueueOutboxWrite(firstMovementId, "stock_adjustment", firstMovement, now);
          }
        }
      );

      showToast("Shop setup complete. Ready to sell.", "success");
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
      const existingProfile = await db.businessProfile.get(BUSINESS_PROFILE_SINGLETON_ID);
      const session = await db.session.get(SESSION_SINGLETON_ID);
      const user = session?.userId ? await db.localUsers.get(session.userId) : null;
      const businessId = existingProfile?.businessId ?? user?.businessId ?? (await getLocalBusinessId());

      await db.transaction(
        "rw",
        db.businessProfile,
        db.categories,
        db.branches,
        async () => {
          await db.businessProfile.put({
            id: BUSINESS_PROFILE_SINGLETON_ID,
            businessId,
            name: state.businessName.trim() || "My Retail Shop",
            businessTypeId: template.id,
            currency: "NGN",
          });
          await db.categories.bulkPut(
            template.defaultCategories.map((name) => ({
              id: crypto.randomUUID(),
              businessId,
              name,
            }))
          );
          await db.branches.add({
            id: crypto.randomUUID(),
            businessId,
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

      {/* Upfront Verification Notice: tells users what is required for cloud database sync */}
      {emailVerified === false && (
        <div className="my-2 flex items-start gap-3 rounded-2xl bg-warning-container border border-warning/30 p-3.5 text-on-warning-container text-xs shadow-xs">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
            <AlertTriangle size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-on-warning-container text-xs sm:text-sm">
              Account verification required for cloud sync
            </p>
            <p className="text-on-warning-container/85 mt-0.5 leading-relaxed">
              You can set up your store and sell offline right now. To sync products and branches to your central database, verify your email.
            </p>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => router.push("/verify-email")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-on-warning hover:opacity-90 transition-opacity shadow-xs"
              >
                Verify Email Now
              </button>
            </div>
          </div>
        </div>
      )}

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
