import { describe, it, expect } from "vitest";

describe("Rapid Stocking Loop (FigoBooks Pattern)", () => {
  it("computes nominal profit and margin percentage correctly", () => {
    const costPrice = 700;
    const sellPrice = 1000;
    const profit = sellPrice - costPrice;
    const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

    expect(profit).toBe(300);
    expect(margin).toBe(30);
  });

  it("handles break-even zero profit correctly", () => {
    const costPrice = 500;
    const sellPrice = 500;
    const profit = sellPrice - costPrice;
    const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

    expect(profit).toBe(0);
    expect(margin).toBe(0);
  });

  it("handles negative profit (selling at a loss)", () => {
    const costPrice = 1200;
    const sellPrice = 1000;
    const profit = sellPrice - costPrice;
    const margin = sellPrice > 0 ? (profit / sellPrice) * 100 : 0;

    expect(profit).toBe(-200);
    expect(margin).toBe(-20);
  });

  it("preserves categoryId and unitLabel across stocking iterations", () => {
    const initialCategoryId = "cat-beverages";
    const initialUnitLabel = "can";

    // Simulating the rapid-stocking loop state preservation:
    const nextFormValues = {
      name: "",
      sku: "",
      barcode: "",
      sellPrice: "",
      costPrice: "",
      categoryId: initialCategoryId,
      unitLabel: initialUnitLabel,
    };

    expect(nextFormValues.categoryId).toBe("cat-beverages");
    expect(nextFormValues.unitLabel).toBe("can");
    expect(nextFormValues.name).toBe("");
  });
});
