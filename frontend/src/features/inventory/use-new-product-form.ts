import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { getLastCategoryId, markCategoryUsed } from "@/lib/last-used-category";
import { db } from "@/lib/db";
import { tenantArray } from "@/lib/local-tenant";
import type { Product } from "@/types/product";
import {
  PRODUCT_FORM_DEFAULTS,
  productFormSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "@/features/inventory/product-schema";
import { writeNewProductOffline } from "@/features/inventory/product-offline-write";
import { validateStartingStock } from "@/features/inventory/starting-stock";
import { findProductReferenceConflict } from "@/features/inventory/product-references";
import { generateFallbackSku } from "@/features/inventory/generate-sku";
import { countActiveProducts, productCapStatusFor } from "@/features/inventory/product-cap";
import { PRODUCT_CAP } from "@/config/limits";
import { loadDraft, saveDraft, clearDraftStorage } from "@/hooks/use-draft";

const PRODUCT_FORM_DRAFT_KEY = "stockpadi-draft-product-new";

interface ProductFormDraftState {
  values?: Partial<ProductFormInput>;
  initialStock?: string;
  initialStockBranchId?: string | null;
  categoryId?: string;
  categoryInputName?: string;
  showUnitConversion?: boolean;
}

export interface AddedProductSummary {
  name: string;
  sellPrice: number;
  costPrice: number;
  profit: number;
  margin: number;
}

/**
 * All state and the create-product write path for the Add Product screen:
 * category autocomplete state, the optional quantity-in-stock + branch fields,
 * automatic localStorage draft preservation across accidental reloads,
 * and the continuous "Add Another" modal flow.
 */
export function useNewProductForm(options?: { prefillName?: string; prefillBarcode?: string }) {
  const prefillName = options?.prefillName;
  const prefillBarcode = options?.prefillBarcode;
  const user = useCurrentUser();
  const router = useRouter();
  const { showToast } = useToast();
  const categories = useLiveQuery(() => tenantArray(db.categories), [], []);
  const branches = useLiveQuery(() => tenantArray(db.branches), [], []);

  // Restore saved draft if user previously refreshed the page
  const [initialDraft] = useState<ProductFormDraftState | null>(() => {
    if (typeof window !== "undefined") {
      return loadDraft<ProductFormDraftState | null>(PRODUCT_FORM_DRAFT_KEY, null);
    }
    return null;
  });

  const [initialStock, setInitialStock] = useState(initialDraft?.initialStock ?? "");
  const [initialStockBranchId, setInitialStockBranchId] = useState<string | null>(
    initialDraft?.initialStockBranchId ?? null
  );
  const [categoryId, setCategoryId] = useState(
    initialDraft?.categoryId ?? getLastCategoryId() ?? ""
  );
  const [categoryInputName, setCategoryInputName] = useState(
    initialDraft?.categoryInputName ?? ""
  );
  const [showUnitConversion, setShowUnitConversion] = useState(
    initialDraft?.showUnitConversion ?? false
  );

  const [initialStockError, setInitialStockError] = useState<string | null>(null);
  const [initialStockBranchError, setInitialStockBranchError] = useState<string | null>(null);
  const [autoSkuEnabled, setAutoSkuEnabled] = useState(true);
  const [successModalProduct, setSuccessModalProduct] = useState<AddedProductSummary | null>(null);
  const [lastAddedProduct, setLastAddedProduct] = useState<AddedProductSummary | null>(null);

  const lastAutoSku = useRef("");
  const lastSkuPrefix = useRef<string | null>(null);
  const pendingSkuTail = useRef(0);

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      ...PRODUCT_FORM_DEFAULTS,
      ...(initialDraft?.values ?? {}),
      name: prefillName ?? initialDraft?.values?.name ?? "",
      barcode: prefillBarcode ?? initialDraft?.values?.barcode ?? "",
    },
  });
  const { register, handleSubmit, control, formState } = form;
  const expiryTracking = useWatch({ control, name: "expiryTracking" });
  const unitLabel = useWatch({ control, name: "unitLabel" }) || "piece";
  const altUnitLabel = useWatch({ control, name: "altUnitLabel" }) || "";

  // Auto-save form draft to localStorage on changes (debounced 250ms)
  const watchedFormValues = useWatch({ control });
  useEffect(() => {
    const hasUserContent =
      Boolean(watchedFormValues.name?.trim()) ||
      Boolean(watchedFormValues.barcode?.trim()) ||
      Boolean(watchedFormValues.sellPrice) ||
      Boolean(watchedFormValues.costPrice) ||
      Boolean(initialStock.trim());

    if (!hasUserContent) return;

    const timer = setTimeout(() => {
      saveDraft<ProductFormDraftState>(PRODUCT_FORM_DRAFT_KEY, {
        values: watchedFormValues,
        initialStock,
        initialStockBranchId,
        categoryId,
        categoryInputName,
        showUnitConversion,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [
    watchedFormValues,
    initialStock,
    initialStockBranchId,
    categoryId,
    categoryInputName,
    showUnitConversion,
  ]);

  const effectiveStockBranchId = initialStockBranchId ?? (branches?.length === 1 ? branches[0].id : null);
  const earlyInitialStockQty = Number(initialStock);
  const hasInitialStock = initialStock !== "" && Number.isFinite(earlyInitialStockQty) && earlyInitialStockQty > 0;

  function skuSuggestionFor(name: string): string {
    const trimmed = name.trim();
    const prefix = trimmed
      ? trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "ITEM"
      : "";
    if (!prefix) return "";
    if (prefix !== lastSkuPrefix.current) {
      lastSkuPrefix.current = prefix;
      pendingSkuTail.current = Math.floor(1000 + Math.random() * 9000);
    }
    return `${prefix}-${pendingSkuTail.current}`;
  }

  function handleNameChange(value: string) {
    if (!autoSkuEnabled) return;
    const suggestion = skuSuggestionFor(value);
    form.setValue("sku", suggestion, { shouldDirty: false, shouldValidate: true });
    lastAutoSku.current = suggestion;
  }

  function handleSkuChange(value: string) {
    if (value !== lastAutoSku.current) setAutoSkuEnabled(false);
  }

  function updateInitialStock(value: string) {
    setInitialStock(value);
    if (initialStockError && value.trim() !== "") setInitialStockError(null);
  }

  function updateInitialStockBranch(branchId: string | null) {
    setInitialStockBranchId(branchId);
    if (branchId) setInitialStockBranchError(null);
  }

  async function executeSave(values: ProductFormValues, addAnother: boolean) {
    try {
      const stockResult = validateStartingStock(initialStock, effectiveStockBranchId, branches?.length ?? 0);
      if (!stockResult.ok) {
        const stockError = stockResult.error ?? "Check the highlighted fields.";
        if (stockResult.reason === "branch") {
          setInitialStockBranchError(stockError);
        } else {
          setInitialStockError(stockError);
        }
        showToast(stockError, "warning");
        return;
      }

      const capStatus = productCapStatusFor((await countActiveProducts()) + 1);
      if (capStatus === "blocked") {
        showToast(`This store is at its ${PRODUCT_CAP}-product cap. Remove some to free space.`, "danger");
        return;
      }
      if (capStatus === "warn") {
        showToast(`Getting close to the ${PRODUCT_CAP}-product cap.`, "warning");
      }

      let resolvedCategoryId: string | null = categoryId || null;
      let newCategory: { id: string; name: string } | null = null;
      const newCategoryName = categoryInputName.trim();
      if (!resolvedCategoryId && newCategoryName) {
        const existingCategory = categories?.find((category) => category.name.trim().toLocaleLowerCase() === newCategoryName.toLocaleLowerCase());
        if (existingCategory) {
          resolvedCategoryId = existingCategory.id;
        } else {
          resolvedCategoryId = crypto.randomUUID();
          newCategory = { id: resolvedCategoryId, name: newCategoryName };
        }
      }

      const finalSku = values.sku?.trim() || generateFallbackSku(values.name);
      const hasAltUnit = Boolean(values.altUnitLabel?.trim());
      const product: Product = {
        id: crypto.randomUUID(),
        sku: finalSku,
        barcode: values.barcode || null,
        name: values.name.trim(),
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

      const conflict = await findProductReferenceConflict(product);
      if (conflict) {
        showToast(`A product already uses this ${conflict.field}: "${conflict.value}".`, "danger");
        return;
      }

      await writeNewProductOffline(product, {
        branchId: effectiveStockBranchId!,
        quantity: stockResult.quantity!,
        createdByUserId: user.id,
      }, newCategory, user);

      if (product.categoryId) markCategoryUsed(product.categoryId);

      const costNum = typeof values.costPrice === "number" ? values.costPrice : parseFloat(String(values.costPrice || "0"));
      const sellNum = typeof values.sellPrice === "number" ? values.sellPrice : parseFloat(String(values.sellPrice || "0"));
      const profit = sellNum - costNum;
      const margin = sellNum > 0 ? (profit / sellNum) * 100 : 0;

      clearDraftStorage(PRODUCT_FORM_DRAFT_KEY);

      if (addAnother) {
        setLastAddedProduct({
          name: product.name,
          sellPrice: sellNum,
          costPrice: costNum,
          profit,
          margin,
        });

        // Retain category and unit, reset specific product details
        form.reset({
          ...PRODUCT_FORM_DEFAULTS,
          name: "",
          sku: "",
          barcode: "",
          sellPrice: "" as unknown as number,
          costPrice: "" as unknown as number,
          unitLabel: values.unitLabel || "piece",
          altUnitLabel: values.altUnitLabel || "",
          altUnitConversionFactor: values.altUnitConversionFactor,
          altUnitSellPrice: values.altUnitSellPrice,
          expiryTracking: values.expiryTracking || "off",
        });
        setInitialStock("");
        setAutoSkuEnabled(true);
        lastAutoSku.current = "";
        lastSkuPrefix.current = null;
        showToast(`${product.name} added! Ready for next product.`, "success");

        setTimeout(() => {
          document.getElementById("field-product-name")?.focus();
        }, 50);
      } else {
        setSuccessModalProduct({
          name: product.name,
          sellPrice: sellNum,
          costPrice: costNum,
          profit,
          margin,
        });
        showToast(`${product.name} added!`, "success");
      }
    } catch (err) {
      console.error("Failed to save product:", err);
      showToast(err instanceof Error ? err.message : "Could not save product.", "danger");
    }
  }

  function handleAddAnotherFromModal() {
    setSuccessModalProduct(null);
    form.reset({
      ...PRODUCT_FORM_DEFAULTS,
      name: "",
      sku: "",
      barcode: "",
      sellPrice: "" as unknown as number,
      costPrice: "" as unknown as number,
      unitLabel: unitLabel || "piece",
      altUnitLabel: altUnitLabel || "",
      expiryTracking: "off",
    });
    setInitialStock("");
    setAutoSkuEnabled(true);
    lastAutoSku.current = "";
    lastSkuPrefix.current = null;
    setTimeout(() => {
      document.getElementById("field-product-name")?.focus();
    }, 50);
  }

  const onSubmit = (e?: React.BaseSyntheticEvent) => {
    return handleSubmit(
      (values) => executeSave(values, false),
      (formErrors) => {
        const firstError = Object.values(formErrors)[0]?.message;
        showToast(typeof firstError === "string" ? firstError : "Please fix the highlighted fields.", "warning");
      }
    )(e);
  };

  const onSaveAndAddAnother = (e?: React.BaseSyntheticEvent) => {
    return handleSubmit(
      (values) => executeSave(values, true),
      (formErrors) => {
        const firstError = Object.values(formErrors)[0]?.message;
        showToast(typeof firstError === "string" ? firstError : "Please fix the highlighted fields.", "warning");
      }
    )(e);
  };

  return {
    user,
    router,
    categories,
    branches,
    initialStock,
    setInitialStock: updateInitialStock,
    initialStockError,
    initialStockBranchId,
    setInitialStockBranchId: updateInitialStockBranch,
    initialStockBranchError,
    onNameChange: handleNameChange,
    onSkuChange: handleSkuChange,
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
    onSaveAndAddAnother,
    lastAddedProduct,
    clearLastAddedProduct: () => setLastAddedProduct(null),
    successModalProduct,
    setSuccessModalProduct,
    handleAddAnotherFromModal,
    clearDraft: () => clearDraftStorage(PRODUCT_FORM_DRAFT_KEY),
    setValue: form.setValue,
    watch: form.watch,
  };
}
