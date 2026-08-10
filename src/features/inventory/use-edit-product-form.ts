import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { assertPermission } from "@/features/auth/assert-permission";
import { db } from "@/lib/db";
import { markCategoryUsed } from "@/lib/last-used-category";
import type { Product } from "@/types/product";
import { productFormSchema, type ProductFormInput, type ProductFormValues } from "@/features/inventory/product-schema";

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

  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const product = useLiveQuery(() => db.products.get(id), [id]);
  const totalStock = useLiveQuery(
    async () => {
      const movements = await db.stockMovements.where("productId").equals(id).toArray();
      return movements.reduce((sum, m) => sum + m.quantityDelta, 0);
    },
    [id],
    undefined
  );

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
    await assertPermission(user, "edit_products");

    let resolvedCategoryId: string | null = categoryId || null;
    const newCategoryName = categoryInputName.trim();
    if (!resolvedCategoryId && newCategoryName) {
      resolvedCategoryId = crypto.randomUUID();
      await db.categories.add({ id: resolvedCategoryId, name: newCategoryName });
    }

    const hasAltUnit = Boolean(values.altUnitLabel?.trim());
    await db.products.update(id, {
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
    });
    if (resolvedCategoryId) markCategoryUsed(resolvedCategoryId);
    showToast(`${values.name} updated`, "success");
    router.push("/products");
  });

  async function handleDelete(prod: Product) {
    if (confirm(`Are you sure you want to delete ${prod.name}? This cannot be undone.`)) {
      await db.products.delete(id);
      showToast(`${prod.name} deleted`, "success");
      router.push("/products");
    }
  }

  return {
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
