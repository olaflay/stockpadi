"use client";

import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { hasRole } from "@/features/auth/use-current-user";
import { useNewProductForm } from "@/features/inventory/use-new-product-form";
import { NewProductForm } from "@/features/inventory/components/NewProductForm";

const CAN_EDIT_PRODUCTS = ["owner", "manager", "inventory_staff", "admin"] as const;

export default function NewProductPage() {
  const router = useRouter();
  const {
    user,
    categories,
    branches,
    initialStock,
    setInitialStock,
    initialStockBranchId,
    setInitialStockBranchId,
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
  } = useNewProductForm();

  if (!hasRole(user, [...CAN_EDIT_PRODUCTS])) {
    return (
      <div>
        <ScreenHeader title="Add product" onBack={() => router.push("/products")} />
        <PermissionDenied requiredRoles={["owner", "manager", "inventory_staff", "admin"]} />
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title="Add product" onBack={() => router.push("/products")} />
      <NewProductForm
        onSubmit={onSubmit}
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
        hasInitialStock={hasInitialStock}
        branches={branches}
        initialStockBranchId={initialStockBranchId}
        onInitialStockBranchChange={setInitialStockBranchId}
      />
    </div>
  );
}
