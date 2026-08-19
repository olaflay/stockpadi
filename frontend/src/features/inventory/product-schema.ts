import { z } from "zod";
import { EXPIRY_TRACKING_MODES } from "@/types/product";

/**
 * Validation for the product create/edit form. Mirrors the shape of
 * src/types/product.ts; kept as its own schema (rather than z.infer driving
 * the Product type) because the wire/storage type has fields (id, version,
 * updatedAt) this form never collects, they're assigned at save time.
 */
export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    sku: z.string().trim().min(1, "SKU is required"),
    sellPrice: z.coerce.number({ error: "Enter a valid price" }).min(0, "Sell price can't be negative"),
    costPrice: z.coerce.number({ error: "Enter a valid price" }).min(0, "Cost price can't be negative"),
    barcode: z.string().trim().optional(),
    expiryTracking: z.enum(EXPIRY_TRACKING_MODES),
    expiryDate: z.string().trim().optional(),
    categoryId: z.string().trim().optional(),
    lowStockThreshold: z.coerce.number().min(0, "Can't be negative").optional(),
    unitLabel: z.string().trim().min(1, "Unit is required").default("piece"),
    altUnitLabel: z.string().trim().optional(),
    altUnitConversionFactor: z.coerce.number().optional(),
    altUnitSellPrice: z.coerce.number().optional(),
  })
  .refine((values) => values.expiryTracking !== "mandatory" || Boolean(values.expiryDate), {
    message: "Expiry date is required when expiry tracking is mandatory",
    path: ["expiryDate"],
  })
  .refine((values) => !values.altUnitLabel?.trim() || (values.altUnitConversionFactor ?? 0) > 0, {
    message: "Enter how many base units make up one of these",
    path: ["altUnitConversionFactor"],
  })
  .refine((values) => !values.altUnitLabel?.trim() || (values.altUnitSellPrice ?? -1) >= 0, {
    message: "Enter a valid price for this unit",
    path: ["altUnitSellPrice"],
  });

/** Pre-coercion shape RHF's form state actually holds (sellPrice/costPrice as typed input, not yet coerced to number). */
export type ProductFormInput = z.input<typeof productFormSchema>;
/** Post-coercion shape the resolver hands to onSubmit. */
export type ProductFormValues = z.output<typeof productFormSchema>;

export const PRODUCT_FORM_DEFAULTS: ProductFormInput = {
  name: "",
  sku: "",
  sellPrice: 0,
  costPrice: 0,
  barcode: "",
  expiryTracking: "off",
  expiryDate: "",
  categoryId: "",
  unitLabel: "piece",
  altUnitLabel: "",
};
