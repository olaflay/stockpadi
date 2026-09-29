"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Upload } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
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
    setValue,
    watch,
  } = useNewProductForm({ prefillName, prefillBarcode });

  if (!hasCapability(user, "MANAGE_PRODUCTS")) {
    return (
      <div>
        <ScreenHeader title="Add product" onBack={() => router.push("/products")} />
        <PermissionDenied requiredCapabilities={["MANAGE_PRODUCTS"]} />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader
        title="Add product"
        onBack={() => router.push("/products")}
        action={
          <button
            type="button"
            onClick={() => router.push("/products")}
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
        onCancel={() => router.push("/products")}
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
