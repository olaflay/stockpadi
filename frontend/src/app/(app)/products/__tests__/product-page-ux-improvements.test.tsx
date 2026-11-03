// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import type { CurrentUser } from "@/features/auth/use-current-user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/products",
}));

vi.mock("@/components/ui/BarcodeScanner", () => ({
  BarcodeScanner: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="mock-barcode-scanner">
      <button onClick={onCancel}>Close scanner</button>
    </div>
  ),
}));

const { default: ProductsPage } = await import("@/app/(app)/products/page");

const OWNER_USER: CurrentUser = {
  id: "user-owner",
  fullName: "Shop Owner",
  role: "owner",
  accountType: "BUSINESS_OWNER",
};

const WORKER_USER: CurrentUser = {
  id: "user-worker",
  fullName: "Cashier Alice",
  role: "worker",
  accountType: "WORKER",
  branchIds: ["branch-1"],
  permissions: ["VIEW_PRODUCTS", "POS_SELL"],
};

function renderPage(user: CurrentUser = OWNER_USER) {
  return render(
    <CurrentUserContext.Provider value={user}>
      <ToastProvider>
        <ProductsPage />
      </ToastProvider>
    </CurrentUserContext.Provider>
  );
}

describe("Products Page UX & Role-Safety Improvements", () => {
  beforeEach(async () => {
    await db.branches.clear();
    await db.products.clear();
    await setLocalBusinessId("biz-1");

    await db.products.add({
      id: "prod-1",
      name: "Crispy Crackers",
      sku: "CRK-01",
      barcode: "89012345",
      categoryId: null,
      brandId: null,
      unitLabel: "pack",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: 400,
      sellPrice: 650,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: null,
      businessId: "biz-1",
      archived: false,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the ergonomic + Sell button with accessible touch target", async () => {
    renderPage(WORKER_USER);

    const sellBtn = await screen.findByRole("link", { name: "Sell Crispy Crackers" });
    expect(sellBtn).toBeInTheDocument();
    expect(sellBtn).toHaveAttribute("href", "/pos?add=prod-1");
    expect(screen.queryByRole("link", { name: "Add product" })).not.toBeInTheDocument();
  });

  it("protects confidential business margins from workers on the sales floor", async () => {
    // When worker is viewing the catalog, they see sell price (₦650) but NOT wholesale cost (Cost ₦400) or (+₦250)
    renderPage(WORKER_USER);

    expect(await screen.findByText("Crispy Crackers")).toBeInTheDocument();
    expect(screen.getByText("₦650")).toBeInTheDocument();
    expect(screen.queryByText(/Cost ₦400/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\(\+₦250\)/i)).not.toBeInTheDocument();
  });

  it("displays wholesale cost and markup margin for business owners", async () => {
    renderPage(OWNER_USER);

    expect(await screen.findByText("Crispy Crackers")).toBeInTheDocument();
    expect(screen.getByText("₦650")).toBeInTheDocument();
    expect(await screen.findByText(/Cost ₦400/i)).toBeInTheDocument();
    expect(screen.getByText(/\(\+₦250\)/i)).toBeInTheDocument();
  });
});
