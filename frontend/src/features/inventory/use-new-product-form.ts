import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { getLastCategoryId, markCategoryUsed } from "@/lib/last-used-category";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";
import {
  PRODUCT_FORM_DEFAULTS,
  productFormSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "@/features/inventory/product-schema";
import { serverPost, NetworkUnavailableError } from "@/features/operations/server-client";

/**
 * All state and the create-product write path for the Add Product screen:
 * category autocomplete state, the optional starting-stock + branch fields
 * (kept outside react-hook-form, same reasoning as the category picker —
 * see product-schema.ts), and the product + stock-movement transaction on
 * submit.
 */
export function useNewProductForm() {
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();
  const categories = useLiveQuery(() => tenantArray(db.categories), [], []);
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);
  const [initialStock, setInitialStock] = useState("");
  const [initialStockBranchId, setInitialStockBranchId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState(getLastCategoryId() ?? "");
  const [categoryInputName, setCategoryInputName] = useState("");
  // Off by default — the plain form (one unit, one price) is the whole
  // story for most products. This only reveals the unit-conversion fields
  // when someone actually needs to sell the same stock two ways (e.g.
  // pieces and cartons); nothing changes on screen until they ask for it.
  const [showUnitConversion, setShowUnitConversion] = useState(false);

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: PRODUCT_FORM_DEFAULTS,
  });
  const { register, handleSubmit, watch, control, formState } = form;
  const expiryTracking = watch("expiryTracking");
  const unitLabel = watch("unitLabel") || "piece";
  const altUnitLabel = watch("altUnitLabel") || "";

  const effectiveStockBranchId = initialStockBranchId ?? (branches?.length === 1 ? branches[0].id : null);
  const initialStockQty = Number(initialStock);
  const hasInitialStock = initialStock !== "" && Number.isFinite(initialStockQty) && initialStockQty > 0;

  const onSubmit = handleSubmit(async (values) => {
    if (hasInitialStock && !effectiveStockBranchId) {
      showToast("Choose which branch this stock is at.", "warning");
      return;
    }

    // The autocomplete already resolved to an existing id if the typed name
    // matched one; an empty id with a non-empty name means "create this
    // category," the same way typing a new value into a password-manager
    // field just remembers it — no separate "add category" screen needed.
    let resolvedCategoryId: string | null = categoryId || null;
    const newCategoryName = categoryInputName.trim();
    if (!resolvedCategoryId && newCategoryName) {
      resolvedCategoryId = crypto.randomUUID();
      await db.categories.add({ id: resolvedCategoryId, name: newCategoryName });
    }

    const hasAltUnit = Boolean(values.altUnitLabel?.trim());
    const product: Product = {
      id: crypto.randomUUID(),
      sku: values.sku,
      barcode: values.barcode || null,
      name: values.name,
      categoryId: resolvedCategoryId,
      brandId: null,
      unitLabel: values.unitLabel.trim() || "piece",
      altUnitLabel: hasAltUnit ? values.altUnitLabel!.trim() : null,
      altUnitConversionFactor: hasAltUnit ? (values.altUnitConversionFactor ?? null) : null,
      altUnitSellPrice: hasAltUnit ? (values.altUnitSellPrice ?? null) : null,
      costPrice: values.costPrice,
      sellPrice: values.sellPrice,
      expiryTracking: values.expiryTracking,
      expiryDate: values.expiryTracking === "off" ? null : values.expiryDate || null,
      lowStockThreshold: values.lowStockThreshold ?? null,
      version: 1,
      updatedAt: new Date().toISOString(),
    };


    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        await serverPost("/api/products", product);
        if (hasInitialStock && effectiveStockBranchId) await serverPost("/api/inventory/adjust", { id: crypto.randomUUID(), branchId: effectiveStockBranchId, productId: product.id, quantityDelta: initialStockQty, reasonCode: "initial_stock" });
        if (product.categoryId) markCategoryUsed(product.categoryId);
        showToast(`${product.name} added`, "success");
        router.push("/products");
        return;
      } catch (error) { if (!(error instanceof NetworkUnavailableError)) throw error; }
    }

    if (hasInitialStock && effectiveStockBranchId) {
      const now = new Date().toISOString();
      const movement: StockMovement = {
        id: crypto.randomUUID(),
        clientId: crypto.randomUUID(),
        branchId: effectiveStockBranchId,
        productId: product.id,
        quantityDelta: initialStockQty,
        source: "initial_stock",
        sourceReferenceId: null,
        reasonCode: null,
        createdAtLocal: now,
        createdAt: now,
        createdByUserId: user.id,
      };
      await db.transaction("rw", db.products, db.stockMovements, async () => {
        await db.products.add(product);
        await db.stockMovements.add(movement);
      });
    } else {
      await db.products.add(product);
    }

    if (product.categoryId) markCategoryUsed(product.categoryId);
    showToast(`${product.name} added`, "success");
    router.push("/products");
  });

  return {
    user,
    router,
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
    errors: formState.errors,
    isSubmitting: formState.isSubmitting,
    control,
    expiryTracking,
    unitLabel,
    altUnitLabel,
    hasInitialStock,
    onSubmit,
    setValue: form.setValue,
  };
}
