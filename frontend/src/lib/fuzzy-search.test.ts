import { describe, expect, it } from "vitest";
import { searchProductsFuzzy } from "./fuzzy-search";

const products = [
  { id: "coke", name: "Coke 50cl", sku: "COKE-50", barcode: "615000000001" },
  { id: "water", name: "Bottle Water", sku: "WATER-50", barcode: "615000000002" },
];

describe("searchProductsFuzzy", () => {
  it("matches exact catalog terms without case sensitivity", () => {
    expect(searchProductsFuzzy(products, "cOkE").exact.map((product) => product.id)).toEqual(["coke"]);
  });

  it("suggests a product for a small offline typo", () => {
    expect(searchProductsFuzzy(products, "cuke").suggestions.map((product) => product.id)).toEqual(["coke"]);
  });

  it("keeps barcode searches exact and does not return unrelated fuzzy matches", () => {
    expect(searchProductsFuzzy(products, "615000000002")).toMatchObject({
      exact: [products[1]],
      suggestions: [],
    });
  });
});
