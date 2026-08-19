"use client";

import { ClipboardList } from "lucide-react";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PermissionDenied } from "@/components/ui/PermissionDenied";
import { hasAccountType } from "@/features/auth/use-current-user";
import { BUSINESS_MANAGEMENT_ACCOUNT_TYPES } from "@/features/auth/authorization";
import { useUpdateStock, useUpdateStockRows } from "@/features/purchases/use-update-stock";
import { BranchSelectStep } from "@/features/purchases/components/BranchSelectStep";
import { UpdateStockList } from "@/features/purchases/components/UpdateStockList";
import type { Product } from "@/types/product";

const CAN_BULK_UPDATE = BUSINESS_MANAGEMENT_ACCOUNT_TYPES;

/**
 * One screen to reconcile many products at once — restocking after a
 * delivery means touching most of the catalog, and drilling into a
 * per-product edit screen for each one is the wrong shape for that. Stock
 * count sits first in every row (the field this screen exists for); price,
 * expiry, and SKU sit below it for the same restocking visit to fix a
 * stale price or missed expiry date without a second trip. One Save
 * commits every changed row: stock deltas go through the same
 * ledger-adjustment path as Stock Count (writeStockAdjustment), field
 * edits go through the same db.products.update path as Edit Product.
 */
export default function UpdateStockPage() {
  const { user, router, showToast, branchId, setBranchId, branches, products } = useUpdateStock();

  if (!hasAccountType(user, CAN_BULK_UPDATE)) {
    return (
      <div>
        <ScreenHeader title="Update stock" onBack={() => router.push("/purchases")} />
        <PermissionDenied requiredAccountTypes={CAN_BULK_UPDATE} />
      </div>
    );
  }

  if (branches === undefined || products === undefined) {
    return (
      <div>
        <ScreenHeader title="Update stock" onBack={() => router.push("/purchases")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const effectiveBranchId = branchId ?? (branches.length === 1 ? branches[0].id : null);

  if (!effectiveBranchId) {
    return (
      <div>
        <ScreenHeader title="Update stock" onBack={() => router.push("/purchases")} />
        <BranchSelectStep branches={branches} onSelectBranch={setBranchId} />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div>
        <ScreenHeader title="Update stock" onBack={() => router.push("/purchases")} />
        <EmptyState
          icon={ClipboardList}
          title="No products yet"
          description="Add products before updating stock."
          action={{ label: "Add a product", onClick: () => router.push("/products/new") }}
        />
      </div>
    );
  }

  return (
    <UpdateStockListContainer
      user={user}
      router={router}
      showToast={showToast}
      branchId={effectiveBranchId}
      products={products}
    />
  );
}

function UpdateStockListContainer({
  user,
  router,
  showToast,
  branchId,
  products,
}: {
  user: ReturnType<typeof useUpdateStock>["user"];
  router: ReturnType<typeof useUpdateStock>["router"];
  showToast: ReturnType<typeof useUpdateStock>["showToast"];
  branchId: string;
  products: Product[];
}) {
  const { query, setQuery, isSaving, stockByProduct, dirtyProducts, filtered, rowFor, isDirty, updateRow, handleSave } =
    useUpdateStockRows(user, router, showToast, branchId, products);

  if (stockByProduct === undefined) {
    return (
      <div>
        <ScreenHeader title="Update stock" onBack={() => router.push("/purchases")} />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <UpdateStockList
      onBack={() => router.push("/purchases")}
      query={query}
      onQueryChange={setQuery}
      filtered={filtered}
      rowFor={rowFor}
      isDirty={isDirty}
      updateRow={updateRow}
      dirtyProducts={dirtyProducts}
      isSaving={isSaving}
      onSave={handleSave}
    />
  );
}
