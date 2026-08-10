// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { cartLineKey, useCart } from "@/features/pos/use-cart";

// useDraft persists to sessionStorage — clear it between tests so each
// renderHook call starts with an empty cart, not the previous test's state.
beforeEach(() => sessionStorage.clear());

/**
 * Pure client-side cart state, extracted from pos/page.tsx. No Dexie
 * involved — completeSale (tested separately) is the write path this
 * feeds into.
 */

describe("cartLineKey", () => {
  it("keys by product + unit so the same product can appear twice under different units", () => {
    expect(cartLineKey("product-1", "piece")).toBe("product-1__piece");
    expect(cartLineKey("product-1", "carton")).not.toBe(cartLineKey("product-1", "piece"));
  });
});

describe("useCart", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.cartLines).toHaveLength(0);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it("addToCart adds a new line with quantity 1", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
    });
    expect(result.current.cartLines).toHaveLength(1);
    expect(result.current.cartLines[0]).toMatchObject({
      productId: "product-1",
      unitPrice: 500,
      unitLabel: "piece",
      conversionFactor: 1,
      quantity: 1,
    });
    expect(result.current.total).toBe(500);
    expect(result.current.itemCount).toBe(1);
  });

  it("addToCart on the same product+unit increments quantity instead of duplicating the line", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
      result.current.addToCart("product-1", 500, "piece", 1);
    });
    expect(result.current.cartLines).toHaveLength(1);
    expect(result.current.cartLines[0].quantity).toBe(2);
    expect(result.current.total).toBe(1000);
    expect(result.current.itemCount).toBe(2);
  });

  it("addToCart keeps the same product in separate lines when the unit differs", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
      result.current.addToCart("product-1", 5000, "carton", 12);
    });
    expect(result.current.cartLines).toHaveLength(2);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.total).toBe(5500);
  });

  it("incrementLine bumps quantity for an existing key and is a no-op for an unknown key", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
    });
    act(() => {
      result.current.incrementLine(cartLineKey("product-1", "piece"));
    });
    expect(result.current.cartLines[0].quantity).toBe(2);

    act(() => {
      result.current.incrementLine("does-not-exist__unit");
    });
    expect(result.current.cartLines).toHaveLength(1);
    expect(result.current.cartLines[0].quantity).toBe(2);
  });

  it("decrementLine reduces quantity and removes the line once it hits zero", () => {
    const { result } = renderHook(() => useCart());
    const key = cartLineKey("product-1", "piece");
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
      result.current.addToCart("product-1", 500, "piece", 1);
    });
    act(() => {
      result.current.decrementLine(key);
    });
    expect(result.current.cartLines[0].quantity).toBe(1);

    act(() => {
      result.current.decrementLine(key);
    });
    expect(result.current.cartLines).toHaveLength(0);
    expect(result.current.total).toBe(0);
  });

  it("decrementLine on an unknown key is a no-op", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
    });
    act(() => {
      result.current.decrementLine("does-not-exist__unit");
    });
    expect(result.current.cartLines).toHaveLength(1);
  });

  it("clearCart empties the cart entirely", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
      result.current.addToCart("product-2", 300, "piece", 1);
    });
    act(() => {
      result.current.clearCart();
    });
    expect(result.current.cartLines).toHaveLength(0);
    expect(result.current.total).toBe(0);
    expect(result.current.itemCount).toBe(0);
  });

  it("derives total and itemCount across multiple distinct lines", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.addToCart("product-1", 500, "piece", 1);
      result.current.addToCart("product-1", 500, "piece", 1);
      result.current.addToCart("product-2", 1200, "piece", 1);
    });
    expect(result.current.total).toBe(500 * 2 + 1200);
    expect(result.current.itemCount).toBe(3);
  });
});
