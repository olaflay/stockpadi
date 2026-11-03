// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { db } from "@/lib/db";
import { setLocalBusinessId } from "@/lib/local-tenant";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
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
  usePathname: () => "/purchases/new",
}));

vi.mock("@/components/ui/BarcodeScanner", () => ({
  BarcodeScanner: ({ onCancel }: { onCancel: () => void }) => (
    <div data-testid="mock-barcode-scanner">
      <button onClick={onCancel}>Close scanner</button>
    </div>
  ),
}));

const { default: NewPurchasePage } = await import("@/app/(app)/purchases/new/page");

const mockOwner: CurrentUser = {
  id: "user-owner",
  fullName: "Shop Owner",
  role: "owner",
  accountType: "BUSINESS_OWNER",
};

function renderPage(user: CurrentUser = mockOwner) {
  return render(
    <CurrentUserContext.Provider value={user}>
      <NewPurchasePage />
    </CurrentUserContext.Provider>
  );
}

describe("NewPurchasePage Flow & Ergonomics", () => {
  beforeEach(async () => {
    await db.branches.clear();
    await db.suppliers.clear();
    await db.products.clear();
    await setLocalBusinessId("biz-1");
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the date selection chips with Today active by default", async () => {
    renderPage();

    expect(await screen.findByText("Receive delivery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick date…" })).toBeInTheDocument();
  });

  it("reveals custom date input when 'Pick date…' is selected", async () => {
    renderPage();

    const pickDateBtn = await screen.findByRole("button", { name: "Pick date…" });
    fireEvent.click(pickDateBtn);

    const dateInputs = screen.getAllByDisplayValue(new Date().toISOString().slice(0, 10));
    expect(dateInputs.length).toBeGreaterThan(0);
  });

  it("renders the barcode scan button when products exist and toggles scanner on click", async () => {
    await db.products.add({
      id: "prod-1",
      name: "Notebook",
      barcode: "12345678",
      sku: "NB-01",
      costPrice: 250,
      sellPrice: 350,
      unitLabel: "piece",
      categoryId: null,
      brandId: null,
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: null,
      businessId: "biz-1",
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    renderPage();

    const scanBtn = await screen.findByRole("button", { name: /scan/i });
    expect(scanBtn).toBeInTheDocument();

    fireEvent.click(scanBtn);
    expect(await screen.findByTestId("mock-barcode-scanner")).toBeInTheDocument();

    // Closing scanner returns to normal view
    fireEvent.click(screen.getByText("Close scanner"));
    expect(screen.queryByTestId("mock-barcode-scanner")).not.toBeInTheDocument();
  });
});
