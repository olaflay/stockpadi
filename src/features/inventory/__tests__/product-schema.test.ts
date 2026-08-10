import { describe, expect, it } from "vitest";
import { productFormSchema } from "@/features/inventory/product-schema";

describe("productFormSchema", () => {
  it("accepts a valid product and coerces numeric fields", () => {
    const result = productFormSchema.safeParse({
      name: "Widget",
      sku: "SKU-1",
      sellPrice: "150",
      costPrice: "100",
      barcode: "",
      expiryTracking: "off",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sellPrice).toBe(150);
      expect(result.data.costPrice).toBe(100);
    }
  });

  it("rejects an empty name with a readable message", () => {
    const result = productFormSchema.safeParse({
      name: "  ",
      sku: "SKU-1",
      sellPrice: 100,
      costPrice: 50,
      expiryTracking: "off",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Name is required");
    }
  });

  it("rejects a negative sell price", () => {
    const result = productFormSchema.safeParse({
      name: "Widget",
      sku: "SKU-1",
      sellPrice: -5,
      costPrice: 0,
      expiryTracking: "off",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "Sell price can't be negative")).toBe(true);
    }
  });

  it("rejects a non-numeric sell price with the custom message", () => {
    const result = productFormSchema.safeParse({
      name: "Widget",
      sku: "SKU-1",
      sellPrice: "not-a-number",
      costPrice: 0,
      expiryTracking: "off",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === "Enter a valid price")).toBe(true);
    }
  });
});
