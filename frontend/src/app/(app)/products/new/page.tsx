"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { useNewProductForm } from "@/features/inventory/use-new-product-form";
import { NewProductForm } from "@/features/inventory/components/NewProductForm";

const CAN_EDIT_PRODUCTS = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

function NewProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefill = searchParams.get("prefill") || undefined;
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
  } = useNewProductForm({ prefill });

  if (!hasAccountType(user, CAN_EDIT_PRODUCTS)) {
    return (
      <div>
        <ScreenHeader title="Add product" onBack={() => router.push("/products")} />
        <PermissionDenied requiredAccountTypes={CAN_EDIT_PRODUCTS} />
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
