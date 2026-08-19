"use client";

import { use } from "react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { LOW_STOCK_THRESHOLD } from "@/features/inventory/product-insights";
import { useEditProductForm } from "@/features/inventory/use-edit-product-form";
import { ProductReadOnlyDetails } from "@/features/inventory/components/ProductReadOnlyDetails";
import { EditProductForm } from "@/features/inventory/components/EditProductForm";
import type { Product } from "@/types/product";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";

const CAN_EDIT_PRODUCTS = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: PageProps) {
  const { id } = use(params);
  const {
    user,
    router,
    categories,
    product,
    totalStock,
    showUnitConversion,
    setShowUnitConversion,
    categoryId,
    setCategoryId,
    categoryInputName,
    setCategoryInputName,
    register,
    errors,
    isSubmitting,
    control,
    expiryTracking,
    unitLabel,
    altUnitLabel,
    onSubmit,
    handleDelete,
    setValue,
  } = useEditProductForm(id);

  const canEdit = hasAccountType(user, CAN_EDIT_PRODUCTS);

  const stockData = useLiveQuery(async () => {
    const [movements, branches] = await Promise.all([
      tenantArray(db.stockMovements.where("productId").equals(id)),
      tenantArray(db.branches),
    ]);
    movements.sort((a, b) => b.createdAtLocal.localeCompare(a.createdAtLocal));
    return { movements: movements.slice(0, 30), branches };
  }, [id]);

  if (product === undefined) {
    return (
      <div>
        <ScreenHeader title="Product" onBack={() => router.push("/products")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (product === null) {
    return (
      <div>
        <ScreenHeader title="Product" onBack={() => router.push("/products")} />
        <p className="text-[length:var(--font-size-body)] text-on-surface-muted">Product not found.</p>
      </div>
    );
  }

  const prod = product as Product;
  const effectiveThreshold = prod.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
  const isLowStock = totalStock !== undefined && totalStock < effectiveThreshold;
  const stockValueClass = isLowStock ? "text-stock-alert" : "text-on-surface";

  const MOVEMENT_LABELS: Record<string, string> = {
    sale: "Sale",
    sale_void: "Sale Voided",
    purchase_receipt: "Restocked",
    adjustment: "Adjustment",
    initial_stock: "Initial Stock",
  };

  const renderStockMovements = () => {
    if (!stockData) return <Skeleton className="h-24 mt-6" />;
    const { movements, branches } = stockData;

    return (
      <section className="mt-8 border-t border-border pt-6 pb-20">
        <h2 className="mb-4 text-[length:var(--font-size-label)] font-medium text-on-surface-muted">
          Recent Stock History (Last 30)
        </h2>
        {movements.length === 0 ? (
          <p className="text-[length:var(--font-size-body)] text-on-surface-muted">No stock movements recorded yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-[var(--radius-card)] border border-border">
            {movements.map((m) => {
              const branch = branches.find((b) => b.id === m.branchId);
              const isPositive = m.quantityDelta > 0;
              const formattedDelta = `${isPositive ? "+" : ""}${m.quantityDelta} ${prod.unitLabel ?? "piece"}`;

              return (
                <div key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[length:var(--font-size-body)] font-medium text-on-surface">
                      {MOVEMENT_LABELS[m.source] ?? m.source}
                    </p>
                    <p className="text-[length:var(--font-size-caption)] text-on-surface-muted">
                      {new Date(m.createdAtLocal).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                      {branch && ` · ${branch.name}`}
                    </p>
                  </div>
                  <p className={`shrink-0 text-[length:var(--font-size-body)] font-medium ${isPositive ? "text-success" : "text-danger"}`}>
                    {formattedDelta}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-6">
        <ScreenHeader title={prod.name} onBack={() => router.push("/products")} />
        <ProductReadOnlyDetails product={prod} totalStock={totalStock} stockValueClass={stockValueClass} />
        {renderStockMovements()}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Edit Product" onBack={() => router.push("/products")} />
      <EditProductForm
        totalStock={totalStock}
        stockValueClass={stockValueClass}
        onSubmit={onSubmit}
        register={register}
        setValue={setValue}
        errors={errors}
        control={control}
        categories={categories}
        categoryId={categoryId}
        categoryInputName={categoryInputName}
        onCategorySelect={(newId, name) => {
          setCategoryId(newId);
          setCategoryInputName(name);
        }}
        showUnitConversion={showUnitConversion}
        onToggleUnitConversion={() => setShowUnitConversion((v) => !v)}
        unitLabel={unitLabel}
        altUnitLabel={altUnitLabel}
        expiryTracking={expiryTracking}
        isSubmitting={isSubmitting}
        onDelete={() => handleDelete(prod)}
      />
      {renderStockMovements()}
    </div>
  );
}
