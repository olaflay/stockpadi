"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Upload, Check } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { Modal } from "@/components/ui/Modal";
import { RippleButton } from "@/components/ui/Ripple";
import { formatCurrency } from "@/lib/format";
import { hasCapability } from "@/features/auth/authorization";
import { useNewProductForm } from "@/features/inventory/use-new-product-form";
import { NewProductForm } from "@/features/inventory/components/NewProductForm";

function NewProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillName = searchParams.get("name") || undefined;
  const prefillBarcode = searchParams.get("barcode") || undefined;
  const {
    user,
    categories,
    branches,
    initialStock,
    setInitialStock,
    initialStockError,
    initialStockBranchId,
    setInitialStockBranchId,
    initialStockBranchError,
    onNameChange,
    onSkuChange,
    categoryId,
    setCategoryId,
    categoryInputName,
    setCategoryInputName,
    showUnitConversion,
    setShowUnitConversion,
    register,
    errors,
    isSubmitting,
    control,
    expiryTracking,
    unitLabel,
    altUnitLabel,
    hasInitialStock,
    onSubmit,
    onSaveAndAddAnother,
    lastAddedProduct,
    clearLastAddedProduct,
    successModalProduct,
    handleAddAnotherFromModal,
    setValue,
    watch,
  } = useNewProductForm({ prefillName, prefillBarcode });

  if (!hasCapability(user, "MANAGE_PRODUCTS")) {
    return (
      <div>
        <ScreenHeader title="Add product" backHref="/products" />
        <PermissionDenied requiredCapabilities={["MANAGE_PRODUCTS"]} />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader
        title="Add product"
        backHref="/products"
        action={
          <button
            type="button"
            onClick={() => router.replace("/products")}
            className="text-[length:var(--font-size-body)] font-medium text-on-surface-muted hover:text-on-surface transition-colors px-2 py-1"
          >
            Cancel
          </button>
        }
      />
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-surface-container-low px-3.5 py-1.5 text-xs border border-border/30">
        <span className="text-on-surface-muted truncate">Adding many products?</span>
        <Link
          href="/products/import"
          className="inline-flex items-center gap-1.5 font-semibold text-brand-accent hover:underline shrink-0 py-0.5 px-1.5 rounded"
        >
          <Upload size={13} aria-hidden />
          Import instead
        </Link>
      </div>
      <NewProductForm
        onSubmit={onSubmit}
        onSaveAndAddAnother={onSaveAndAddAnother}
        lastAddedProduct={lastAddedProduct}
        onDismissLastAddedProduct={clearLastAddedProduct}
        onCancel={() => router.replace("/products")}
        register={register}
        setValue={setValue}
        watch={watch}
        errors={errors}
        control={control}
        categories={categories}
        categoryId={categoryId}
        categoryInputName={categoryInputName}
        onCategorySelect={(id, name) => {
          setCategoryId(id);
          setCategoryInputName(name);
        }}
        showUnitConversion={showUnitConversion}
        onToggleUnitConversion={() => setShowUnitConversion((v) => !v)}
        unitLabel={unitLabel}
        altUnitLabel={altUnitLabel}
        expiryTracking={expiryTracking}
        isSubmitting={isSubmitting}
        initialStock={initialStock}
        onInitialStockChange={setInitialStock}
        initialStockError={initialStockError}
        hasInitialStock={hasInitialStock}
        branches={branches}
        initialStockBranchId={initialStockBranchId}
        initialStockBranchError={initialStockBranchError}
        onInitialStockBranchChange={setInitialStockBranchId}
        onNameChange={onNameChange}
        onSkuChange={onSkuChange}
      />

      {successModalProduct && (
        <Modal
          isOpen={Boolean(successModalProduct)}
          onClose={() => router.replace("/products")}
          title="Product Added"
          variant="sheet"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col items-center text-center p-2 sm:p-4 gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success animate-scale-in">
              <Check size={32} strokeWidth={2.5} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-on-surface">
                {successModalProduct.name}
              </h2>
              <p className="text-sm text-on-surface-muted mt-1">
                Selling price:{" "}
                <span className="font-semibold text-on-surface">
                  {formatCurrency(successModalProduct.sellPrice)}
                </span>
                {successModalProduct.profit > 0 && (
                  <span className="ml-2 font-medium text-success">
                    (+{formatCurrency(successModalProduct.profit)}/pc · {Math.round(successModalProduct.margin)}%)
                  </span>
                )}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2.5 w-full">
              <RippleButton
                type="button"
                onClick={handleAddAnotherFromModal}
                className="w-full min-h-[48px] rounded-2xl bg-brand-accent py-3 text-base font-bold text-brand-accent-contrast shadow-xs hover:brightness-105 active:scale-[0.99] transition-all"
              >
                Add another product
              </RippleButton>
              <RippleButton
                type="button"
                onClick={() => router.replace("/products")}
                className="w-full min-h-[48px] rounded-2xl border border-border bg-surface-container py-3 text-base font-semibold text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Done / View products
              </RippleButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <NewProductContent />
    </Suspense>
  );
}
