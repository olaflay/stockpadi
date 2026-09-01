import { describe, expect, it } from "vitest";
import { productCapStatusFor } from "@/features/inventory/product-cap";
import { PRODUCT_CAP, PRODUCT_CAP_WARN_AT } from "@/config/limits";

describe("productCapStatusFor", () => {
  it("returns ok well under the cap and under the warn line", () => {
    expect(productCapStatusFor(0)).toBe("ok");
    expect(productCapStatusFor(PRODUCT_CAP_WARN_AT)).toBe("ok");
  });

  it("warns the moment a projected count crosses the 85% line, still under the cap", () => {
    expect(productCapStatusFor(PRODUCT_CAP_WARN_AT + 1)).toBe("warn");
    expect(productCapStatusFor(PRODUCT_CAP - 1)).toBe("warn");
    expect(productCapStatusFor(PRODUCT_CAP)).toBe("warn");
  });

  it("blocks only when a projected count would exceed the cap", () => {
    expect(productCapStatusFor(PRODUCT_CAP + 1)).toBe("blocked");
  });
});
