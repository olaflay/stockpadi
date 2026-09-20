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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] bg-surface-container px-4 py-3">
        <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
          Adding many products?
        </p>
        <Link
          href="/products/import"
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-2 rounded-[var(--radius-control)] px-2 text-[length:var(--font-size-caption)] font-semibold text-brand-accent hover:bg-brand-accent/10 transition-colors"
        >
          <Upload size={16} aria-hidden />
          Import products instead
        </Link>
      </div>
      <NewProductForm
        onSubmit={onSubmit}
        onCancel={() => router.push("/products")}
        register={register}
        setValue={setValue}
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
