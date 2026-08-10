// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/lib/db";
import { useUpdateStockRows } from "@/features/purchases/use-update-stock";
import { getCurrentStock } from "@/features/inventory/stock";
import type { CurrentUser } from "@/features/auth/use-current-user";
import type { Product } from "@/types/product";

/**
 * useUpdateStockRows extracted from purchases/update-stock/page.tsx:
 * dirty-row tracking against live stock/product data, and the bulk-save
 * path (field edits through db.products.update, stock deltas through the
 * same writeStockAdjustment ledger path as Stock Count).
 */

const BRANCH_ID = "branch-1";
const OWNER: CurrentUser = { id: "user-owner", fullName: "Owner", role: "owner" };
// Cashier has neither edit_products nor stock_adjustments in PERMISSION_MATRIX.
const CASHIER: CurrentUser = { id: "user-cashier", fullName: "Cashier", role: "cashier" };

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    sku: "SKU-1",
    barcode: null,
    name: "Rice",
    categoryId: null,
    brandId: null,
    unitLabel: "bag",
    altUnitLabel: null,
    altUnitConversionFactor: null,
    altUnitSellPrice: null,
    costPrice: 800,
    sellPrice: 1000,
    expiryTracking: "off",
    expiryDate: null,
    lowStockThreshold: null,
    version: 1,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeRouter() {
  return { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() } as unknown as ReturnType<
    typeof import("next/navigation").useRouter
  >;
}

describe("useUpdateStockRows", () => {
  beforeEach(async () => {
    await db.products.clear();
    await db.stockMovements.clear();
    await db.outbox.clear();
  });

  it("rowFor returns the product's current values before any edit is made", async () => {
    const p = product();
    await db.products.add(p);

    const { result } = renderHook(() => useUpdateStockRows(OWNER, fakeRouter(), vi.fn(), BRANCH_ID, [p]));
    await waitFor(() => expect(result.current.stockByProduct).toBeDefined());

    const row = result.current.rowFor(p);
    expect(row.name).toBe("Rice");
    expect(row.sellPrice).toBe("1000");
    expect(row.stock).toBe("0");
    expect(result.current.isDirty(p)).toBe(false);
    expect(result.current.dirtyProducts).toHaveLength(0);
  });

  it("updateRow marks a product dirty only once a field actually differs, and filters by name/sku", async () => {
    const p = product();
    await db.products.add(p);

    const { result } = renderHook(() => useUpdateStockRows(OWNER, fakeRouter(), vi.fn(), BRANCH_ID, [p]));
    await waitFor(() => expect(result.current.stockByProduct).toBeDefined());

    act(() => {
      result.current.updateRow(p, { sellPrice: "1000" }); // unchanged
    });
    expect(result.current.isDirty(p)).toBe(false);

    act(() => {
      result.current.updateRow(p, { sellPrice: "1200" });
    });
    expect(result.current.isDirty(p)).toBe(true);
    expect(result.current.dirtyProducts).toHaveLength(1);

    act(() => {
      result.current.setQuery("beans");
    });
    expect(result.current.filtered).toHaveLength(0);
  });

  it("handleSave writes field edits via db.products.update and clears rows on success", async () => {
    const p = product();
    await db.products.add(p);
    const showToast = vi.fn();
    const router = fakeRouter();

    const { result } = renderHook(() => useUpdateStockRows(OWNER, router, showToast, BRANCH_ID, [p]));
    await waitFor(() => expect(result.current.stockByProduct).toBeDefined());

    act(() => {
      result.current.updateRow(p, { sellPrice: "1500" });
    });

    await act(async () => {
      await result.current.handleSave();
    });

    const updated = await db.products.get(p.id);
    expect(updated?.sellPrice).toBe(1500);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("1 product updated"), "success");
    expect(router.push).toHaveBeenCalledWith("/purchases");
  });

  it("handleSave writes a stock adjustment ledger entry when the stock field changes", async () => {
    const p = product();
    await db.products.add(p);
    const showToast = vi.fn();
    const router = fakeRouter();

    const { result } = renderHook(() => useUpdateStockRows(OWNER, router, showToast, BRANCH_ID, [p]));
    await waitFor(() => expect(result.current.stockByProduct).toBeDefined());

    act(() => {
      result.current.updateRow(p, { stock: "10" });
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(await getCurrentStock(p.id, BRANCH_ID)).toBe(10);
    const movements = await db.stockMovements.where("productId").equals(p.id).toArray();
    expect(movements).toHaveLength(1);
    expect(movements[0].reasonCode).toBe("recount");
  });

  it("handleSave surfaces a failure toast and does not clear rows or navigate when a write is rejected", async () => {
    const p = product();
    await db.products.add(p);
    const showToast = vi.fn();
    const router = fakeRouter();

    const { result } = renderHook(() =>
      useUpdateStockRows(CASHIER, router, showToast, BRANCH_ID, [p])
    );
    await waitFor(() => expect(result.current.stockByProduct).toBeDefined());

    act(() => {
      result.current.updateRow(p, { sellPrice: "1500" });
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(showToast).toHaveBeenCalledWith("Couldn't save some updates. Try again.", "danger");
    expect(router.push).not.toHaveBeenCalled();
    const unchanged = await db.products.get(p.id);
    expect(unchanged?.sellPrice).toBe(1000);
  });
});
