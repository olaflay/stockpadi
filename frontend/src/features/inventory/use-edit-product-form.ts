import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { db } from "@/lib/db";
import { tenantArray, tenantGet } from "@/lib/local-tenant";
import { markCategoryUsed } from "@/lib/last-used-category";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";
import { productFormSchema, type ProductFormInput, type ProductFormValues } from "@/features/inventory/product-schema";
import { writeProductEditOffline } from "@/features/inventory/product-offline-write";
import { findProductReferenceConflict } from "@/features/inventory/product-references";
import { writeStockAdjustment } from "@/features/inventory/write-stock-adjustment";

/**
 * All state and write-path logic for the Edit Product screen: loading the
 * product/categories/current-stock, seeding the form once the product
 * arrives, and the save/delete mutations. The route stays a thin composer
 * over this plus <ProductFormFields>.
 */
export function useEditProductForm(id: string) {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();

  const categories = useLiveQuery(() => tenantArray(db.categories), [], []);
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  const product = useLiveQuery(() => tenantGet<Product>(db.products, id), [id]);
  const totalStock = useLiveQuery(
    async () => {
      const movements = await tenantArray<StockMovement>(db.stockMovements.where("productId").equals(id));
      return movements.reduce((sum, m) => sum + m.quantityDelta, 0);
    },
    [id],
    undefined
  );

  const [stockInput, setStockInput] = useState("");
  const [stockBranchId, setStockBranchId] = useState<string | null>(null);
  const [stockInitialized, setStockInitialized] = useState(false);

  useEffect(() => {
    if (totalStock !== undefined && !stockInitialized) {
      setStockInput(String(totalStock));
      setStockInitialized(true);
    }
  }, [totalStock, stockInitialized]);

  // Starts open only if this product already uses a second unit, so
  // existing data is never hidden; otherwise stays collapsed like Add
  // Product's simple-by-default form.
  const [showUnitConversion, setShowUnitConversion] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [categoryInputName, setCategoryInputName] = useState("");

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
  });
  const { register, handleSubmit, setValue, watch, control, formState } = form;
  const expiryTracking = watch("expiryTracking");
  const unitLabel = watch("unitLabel") || "piece";
  const altUnitLabel = watch("altUnitLabel") || "";

  // Load existing values into form when product has loaded
  useEffect(() => {
    if (product) {
      setValue("name", product.name);
      setValue("sku", product.sku);
      setValue("sellPrice", product.sellPrice);
      setValue("costPrice", product.costPrice);
      setValue("barcode", product.barcode || "");
      setValue("expiryTracking", product.expiryTracking);
      setValue("expiryDate", product.expiryDate || "");
      setCategoryId(product.categoryId || "");
      setValue("unitLabel", product.unitLabel || "piece");
      setValue("altUnitLabel", product.altUnitLabel || "");
      if (product.altUnitConversionFactor !== null) setValue("altUnitConversionFactor", product.altUnitConversionFactor);
      if (product.altUnitSellPrice !== null) setValue("altUnitSellPrice", product.altUnitSellPrice);
      if (product.lowStockThreshold !== null) setValue("lowStockThreshold", product.lowStockThreshold);
      if (product.altUnitLabel) setShowUnitConversion(true);
    }
  }, [product, setValue]);

  const onSubmit = handleSubmit(async (values) => {

    let resolvedCategoryId: string | null = categoryId || null;
    const newCategoryName = categoryInputName.trim();
    if (!resolvedCategoryId && newCategoryName) {
      resolvedCategoryId = crypto.randomUUID();
      await db.categories.add({ id: resolvedCategoryId, name: newCategoryName });
    }

    const hasAltUnit = Boolean(values.altUnitLabel?.trim());
    const update = {
      sku: values.sku,
      barcode: values.barcode || null,
      name: values.name,
      categoryId: resolvedCategoryId,
      unitLabel: values.unitLabel.trim() || "piece",
      altUnitLabel: hasAltUnit ? values.altUnitLabel!.trim() : null,
      altUnitConversionFactor: hasAltUnit ? (values.altUnitConversionFactor ?? null) : null,
      altUnitSellPrice: hasAltUnit ? (values.altUnitSellPrice ?? null) : null,
      costPrice: values.costPrice,
      sellPrice: values.sellPrice,
      expiryTracking: values.expiryTracking,
      expiryDate: values.expiryTracking === "off" ? null : values.expiryDate || null,
      lowStockThreshold: values.lowStockThreshold ?? null,
      updatedAt: new Date().toISOString(),
    };
    const conflict = await findProductReferenceConflict(update, id);
    if (conflict) {
      showToast(`Another product already uses this ${conflict.field}: "${conflict.value}".`, "danger");
      return;
    }
    // Always written through the single offline-first path (upsert local +
    // outbox in one transaction, idempotent on sync). The earlier direct-POST
    // fast path returned without updating the local store, leaving this
    // device's cached copy stale until a pull that didn't exist; routing every
    // edit through the outbox also gives the last-write-wins merge its version
    // handling. See .agents/rules/offline-sync-and-ledger.md.
    await writeProductEditOffline(id, update);

    // If stock quantity was changed on the edit screen, record the ledger adjustment
    const newStockQty = Number(stockInput.trim());
    if (
      stockInput.trim() !== "" &&
      Number.isFinite(newStockQty) &&
      newStockQty >= 0 &&
      totalStock !== undefined &&
      newStockQty !== totalStock
    ) {
      const effectiveBranchId = stockBranchId ?? (branches && branches.length > 0 ? branches[0].id : null);
      if (effectiveBranchId) {
        await writeStockAdjustment({
          branchId: effectiveBranchId,
          productId: id,
          countedQuantity: newStockQty,
          reasonCode: "recount",
          note: "Updated from Edit Product",
          createdByUserId: user.id,
          actor: user,
        });
      }
    }

    if (resolvedCategoryId) markCategoryUsed(resolvedCategoryId);
    showToast(`${values.name} updated`, "success");
    router.push("/products");
  });

  async function handleDelete(prod: Product) {
    if (user.accountType !== "BUSINESS_OWNER" && user.accountType !== "ADMIN") {
      showToast("Only the store owner can delete products.", "danger");
      return;
    }
    await db.products.delete(id);
    showToast(`${prod.name} deleted`, "success");
    router.push("/products");
  }

  return {
    user,
    router,
    categories,
    branches,
    product,
    totalStock,
    stockInput,
    setStockInput,
    stockBranchId,
    setStockBranchId,
    showUnitConversion,
    setShowUnitConversion,
    categoryId,
    setCategoryId,
    categoryInputName,
    setCategoryInputName,
    register,
    errors: formState.errors,
    isSubmitting: formState.isSubmitting,
    control,
    expiryTracking,
    unitLabel,
    altUnitLabel,
    onSubmit,
    handleDelete,
    setValue: form.setValue,
  };
}
