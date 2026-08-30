import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { writeStockAdjustment } from "@/features/inventory/write-stock-adjustment";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/features/auth/use-current-user";
import type { Product } from "@/types/product";
import { tenantArray } from "@/lib/local-tenant";
import { serverPost, NetworkUnavailableError, BackendConfigurationError } from "@/features/operations/server-client";

export interface RowState {
  name: string;
  sku: string;
  sellPrice: string;
  expiryDate: string;
  stock: string;
}

function baseRow(product: Product, currentStock: number): RowState {
  return {
    name: product.name,
    sku: product.sku,
    sellPrice: String(product.sellPrice),
    expiryDate: product.expiryDate ?? "",
    stock: String(currentStock),
  };
}

/**
 * Top-level state for the Update Stock screen: which branch is selected,
 * the product/branch lists it can be selected from.
 */
export function useUpdateStock() {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();
  const [branchId, setBranchId] = useState<string | null>(null);

  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  const products = useLiveQuery(async () => (await tenantArray<Product>(db.products)).sort((a, b) => a.name.localeCompare(b.name)), [], []);

  return { user, router, showToast, branchId, setBranchId, branches, products };
}

/**
 * Once a branch is picked: the editable rows keyed by product, dirty
 * tracking against the live stock/product data, and the bulk-save write
 * path (field edits go through db.products.update, stock deltas through
 * the same ledger-adjustment path as Stock Count).
 */
export function useUpdateStockRows(
  user: ReturnType<typeof useCurrentUser>,
  router: ReturnType<typeof useRouter>,
  showToast: ReturnType<typeof useToast>["showToast"],
  branchId: string,
  products: Product[]
) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [isSaving, setIsSaving] = useState(false);

  const stockByProduct = useLiveQuery(async () => {
    const movements = await tenantArray(db.stockMovements.where("branchId").equals(branchId));
    const map = new Map<string, number>();
    for (const movement of movements) {
      map.set(movement.productId, (map.get(movement.productId) ?? 0) + movement.quantityDelta);
    }
    return map;
  }, [branchId]);

  function currentStockFor(productId: string): number {
    return stockByProduct?.get(productId) ?? 0;
  }

  function rowFor(product: Product): RowState {
    return rows[product.id] ?? baseRow(product, currentStockFor(product.id));
  }

  function updateRow(product: Product, changes: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [product.id]: { ...rowFor(product), ...changes },
    }));
  }

  function isDirty(product: Product): boolean {
    const row = rows[product.id];
    if (!row) return false;
    return (
      row.name.trim() !== product.name ||
      row.sku.trim() !== product.sku ||
      Number(row.sellPrice) !== product.sellPrice ||
      (row.expiryDate || null) !== product.expiryDate ||
      Number(row.stock) !== currentStockFor(product.id)
    );
  }

  const dirtyProducts = products.filter(isDirty);
  const filtered = products.filter((p) => `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()));

  async function handleSave() {
    setIsSaving(true);
    try {
      for (const product of dirtyProducts) {
        const row = rows[product.id]!;
        const newStock = Number(row.stock);
        const newSellPrice = Number(row.sellPrice);

        const fieldsChanged =
          row.name.trim() !== product.name ||
          row.sku.trim() !== product.sku ||
          newSellPrice !== product.sellPrice ||
          (row.expiryDate || null) !== product.expiryDate;

        if (fieldsChanged) {
          const update = {
            name: row.name.trim() || product.name,
            sku: row.sku.trim() || product.sku,
            sellPrice: Number.isFinite(newSellPrice) ? newSellPrice : product.sellPrice,
            expiryDate: row.expiryDate || null,
            updatedAt: new Date().toISOString(),
          };
          if (typeof navigator !== "undefined" && navigator.onLine) {
            try {
              await serverPost("/api/products", { id: product.id, ...update });
            } catch (error) {
              if (
                !(error instanceof NetworkUnavailableError) &&
                !(error instanceof BackendConfigurationError)
              ) {
                throw error;
              }
              await db.products.update(product.id, update);
            }
          } else {
            await db.products.update(product.id, update);
          }
        }

        if (Number.isFinite(newStock) && newStock !== currentStockFor(product.id)) {
          await writeStockAdjustment({
            branchId,
            productId: product.id,
            countedQuantity: newStock,
            reasonCode: "recount",
            note: "Bulk update",
            createdByUserId: user.id,
            actor: user,
          });
        }
      }
      showToast(`${dirtyProducts.length} ${dirtyProducts.length === 1 ? "product" : "products"} updated`, "success");
      setRows({});
      router.push("/purchases");
    } catch {
      showToast("Couldn't save some updates. Try again.", "danger");
    } finally {
      setIsSaving(false);
    }
  }

  return {
    query,
    setQuery,
    isSaving,
    stockByProduct,
    dirtyProducts,
    filtered,
    rowFor,
    updateRow,
    isDirty,
    handleSave,
  };
}
