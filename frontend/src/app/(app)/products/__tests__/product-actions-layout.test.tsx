// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import type { CurrentUser } from "@/features/auth/use-current-user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/products",
}));

vi.mock("@/components/ui/BarcodeScanner", () => ({ BarcodeScanner: () => null }));

const { default: ProductsPage } = await import("@/app/(app)/products/page");

const OWNER: CurrentUser = {
  id: "owner-1",
  fullName: "Owner",
  role: "owner",
  accountType: "BUSINESS_OWNER",
};

describe("product page action hierarchy", () => {
  beforeEach(async () => {
    await db.products.clear();
    await setLocalBusinessId("biz-1");
    await db.products.add({
      id: "product-1",
      name: "Sample product",
      sku: "SAMPLE-1",
      barcode: null,
      categoryId: null,
      brandId: null,
      unitLabel: "unit",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: 100,
      sellPrice: 150,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: null,
      businessId: "biz-1",
      archived: false,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(cleanup);

  it("keeps one primary Add product FAB and secondary actions in the management menu", async () => {
    render(
      <CurrentUserContext.Provider value={OWNER}>
        <ToastProvider><ProductsPage /></ToastProvider>
      </CurrentUserContext.Provider>,
    );

    expect(await screen.findByText("Sample product")).toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Search by name, SKU, or barcode" });
    const searchContainer = search.parentElement;
    const scanButton = screen.getByRole("button", { name: "Scan barcode to search" });
    const manageButton = screen.getByRole("button", { name: "Manage products" });
    expect(searchContainer).toHaveClass("h-12", "min-h-12");
    expect(scanButton).toHaveClass("h-12", "min-h-12");
    expect(manageButton).toHaveClass("h-12", "min-h-12");
    expect(searchContainer?.className).not.toContain("border");
    expect(scanButton.className).not.toContain("border");
    expect(manageButton.className).not.toContain("border");
    expect(screen.getByRole("link", { name: "Add product" })).toHaveAttribute("href", "/products/new");
    expect(screen.queryByRole("menuitem", { name: "Import products" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manage products" }));
    expect(screen.getByRole("menuitem", { name: "Import products" })).toHaveAttribute("href", "/products/import");
    expect(screen.queryByRole("menuitem", { name: "Add product" })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Product actions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Manage products" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Select products to archive" }));
    expect(screen.queryByRole("link", { name: "Add product" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all" })).toBeInTheDocument();
  });
});
