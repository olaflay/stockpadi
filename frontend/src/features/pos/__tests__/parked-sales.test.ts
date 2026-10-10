// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getParkedSales,
  parkSale,
  resumeParkedSale,
  deleteParkedSale,
} from "@/features/pos/parked-sales";

beforeEach(() => {
  localStorage.clear();
});

describe("parked-sales", () => {
  it("starts empty", () => {
    expect(getParkedSales()).toEqual([]);
  });

  it("parks an active cart with items and discount", () => {
    const lines = [
      { productId: "p1", quantity: 2, unitPrice: 100, unitLabel: "piece", conversionFactor: 1 },
    ];
    const parked = parkSale({ lines, discount: 50, label: "Table 4" });

    expect(parked.id).toBeDefined();
    expect(parked.label).toBe("Table 4");
    expect(parked.discount).toBe(50);
    expect(parked.lines).toEqual(lines);

    const all = getParkedSales();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(parked.id);
  });

  it("rejects parking an empty cart", () => {
    expect(() => parkSale({ lines: [] })).toThrow("Cannot park an empty cart.");
  });

  it("resumes a parked sale and removes it from the held list", () => {
    const lines1 = [{ productId: "p1", quantity: 1, unitPrice: 100, unitLabel: "piece", conversionFactor: 1 }];
    const lines2 = [{ productId: "p2", quantity: 3, unitPrice: 200, unitLabel: "piece", conversionFactor: 1 }];

    const s1 = parkSale({ lines: lines1, label: "Customer 1" });
    const s2 = parkSale({ lines: lines2, label: "Customer 2" });

    expect(getParkedSales()).toHaveLength(2);

    const resumed = resumeParkedSale(s1.id);
    expect(resumed?.id).toBe(s1.id);
    expect(resumed?.label).toBe("Customer 1");

    const remaining = getParkedSales();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(s2.id);
  });

  it("deletes a parked sale", () => {
    const lines = [{ productId: "p1", quantity: 1, unitPrice: 100, unitLabel: "piece", conversionFactor: 1 }];
    const s1 = parkSale({ lines });

    expect(getParkedSales()).toHaveLength(1);
    deleteParkedSale(s1.id);
    expect(getParkedSales()).toHaveLength(0);
  });

  it("keeps held sales isolated by business", () => {
    parkSale({ businessId: "business-a", lines: [{ productId: "a", quantity: 1, unitPrice: 100, unitLabel: "piece", conversionFactor: 1 }] });
    parkSale({ businessId: "business-b", lines: [{ productId: "b", quantity: 1, unitPrice: 200, unitLabel: "piece", conversionFactor: 1 }] });

    expect(getParkedSales("business-a").map((sale) => sale.lines[0]?.productId)).toEqual(["a"]);
    expect(getParkedSales("business-b").map((sale) => sale.lines[0]?.productId)).toEqual(["b"]);
    expect(resumeParkedSale(getParkedSales("business-a")[0]!.id, "business-a")?.businessId).toBe("business-a");
    expect(getParkedSales("business-b")).toHaveLength(1);
  });
});
