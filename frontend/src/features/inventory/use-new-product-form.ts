import { useRef, useState } from "react";
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
import {
  PRODUCT_FORM_DEFAULTS,
  productFormSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "@/features/inventory/product-schema";
import { writeNewProductOffline } from "@/features/inventory/product-offline-write";
import { validateStartingStock } from "@/features/inventory/starting-stock";
import { findProductReferenceConflict } from "@/features/inventory/product-references";
import { countActiveProducts, productCapStatusFor } from "@/features/inventory/product-cap";
import { PRODUCT_CAP } from "@/config/limits";

/**
 * All state and the create-product write path for the Add Product screen:
 * category autocomplete state, the optional starting-stock + branch fields
 * (kept outside react-hook-form, same reasoning as the category picker —
 * see product-schema.ts), and the product + stock-movement transaction on
 * submit.
 */
export function useNewProductForm(options?: { prefill?: string }) {
  const prefill = options?.prefill;
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
  // Compulsory Starting stock + (multi-branch) branch: validated inside
  // onSubmit, kept outside react-hook-form like the category picker, and
  // surfaced as a red control via TextInput/SelectInput hasError.
  const [initialStockError, setInitialStockError] = useState<string | null>(null);
  const [initialStockBranchError, setInitialStockBranchError] = useState<string | null>(null);
  // Live SKU auto-fill: the SKU field mirrors the name as it's typed; the
  // first manual edit to the SKU turns auto-fill off for this form.
  const [autoSkuEnabled, setAutoSkuEnabled] = useState(true);
  const lastAutoSku = useRef("");
  const lastSkuPrefix = useRef<string | null>(null);
  const pendingSkuTail = useRef(0);

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      ...PRODUCT_FORM_DEFAULTS,
      name: prefill ?? "",
    },
  });
  const { register, handleSubmit, watch, control, formState } = form;
  const expiryTracking = watch("expiryTracking");
  const unitLabel = watch("unitLabel") || "piece";
  const altUnitLabel = watch("altUnitLabel") || "";

  const effectiveStockBranchId = initialStockBranchId ?? (branches?.length === 1 ? branches[0].id : null);
  const earlyInitialStockQty = Number(initialStock);
  const hasInitialStock = initialStock !== "" && Number.isFinite(earlyInitialStockQty) && earlyInitialStockQty > 0;

  function generateFallbackSku(name: string): string {
    const prefix = name
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase() || "ITEM";
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${rand}`;
  }

  // The live SKU-fill keeps its random tail stable while the user keeps
  // typing within the same name stem, so the field doesn't visibly jitter
  // on every keystroke.
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

  const onSubmit = handleSubmit(
    async (values) => {
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
        const newCategoryName = categoryInputName.trim();
        if (!resolvedCategoryId && newCategoryName) {
          resolvedCategoryId = crypto.randomUUID();
          await db.categories.add({ id: resolvedCategoryId, name: newCategoryName });
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
        });

        if (product.categoryId) markCategoryUsed(product.categoryId);
        showToast(`${product.name} added`, "success");
        router.push("/products");
      } catch (err) {
        console.error("Failed to save product:", err);
        showToast(err instanceof Error ? err.message : "Could not save product.", "danger");
      }
    },
    (formErrors) => {
      const firstError = Object.values(formErrors)[0]?.message;
      showToast(typeof firstError === "string" ? firstError : "Please fix the highlighted fields.", "warning");
    }
  );

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
    setValue: form.setValue,
  };
}
