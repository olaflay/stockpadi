import { describe, expect, it } from "vitest";
import { isNavAllowedOnRoute } from "../NavigationContext";

describe("form actions stay clear of bottom navigation", () => {
  it.each(["", "/business", "/work"])("hides navigation on forms under %s", (prefix) => {
    for (const route of ["/products/new", "/products/product-1", "/settings/business", "/close-day", "/staff/new"]) {
      expect(isNavAllowedOnRoute(prefix + route)).toBe(false);
    }
  });
  it.each(["/products", "/products/import", "/business/products", "/work/products", "/dashboard"])("keeps normal navigation on %s", (route) => {
    expect(isNavAllowedOnRoute(route)).toBe(true);
  });
});
