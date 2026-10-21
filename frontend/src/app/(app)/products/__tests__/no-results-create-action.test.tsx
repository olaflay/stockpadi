// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/lib/db";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import type { CurrentUser } from "@/features/auth/use-current-user";

/**
 * Regression cover for the products "no results" state.
 *
 * The old shared NoResultsState hardcoded a "Create <query>" product CTA and
 * navigated to `/products/new?prefill=<query>`. The new-product form only
 * ever read `name` and `barcode`, so that link silently dropped the query
 * and opened a blank form. The products screen now supplies the create
 * action itself, prefilling `name` for a typed search and `barcode` for a
 * scanned one.
 */

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
  BarcodeScanner: ({
    onResult,
    onCancel,
  }: {
    onResult: (res: string) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="barcode-scanner-mock">
      <button onClick={() => onResult("6900000000002")} aria-label="Simulate Scan">
        Scan
      </button>
      <button onClick={() => onResult("BC/9988+77#1")} aria-label="Simulate Special Barcode Scan">
        Scan Special
      </button>
      <button onClick={onCancel} aria-label="Cancel Scan">
        Cancel
      </button>
    </div>
  ),
}));

const { default: ProductsPage } = await import("@/app/(app)/products/page");

const OWNER: CurrentUser = {
  id: "user-owner",
  fullName: "Owner",
  accountType: "BUSINESS_OWNER",
};

function renderPage(user: CurrentUser = OWNER) {
  return render(
    <CurrentUserContext.Provider value={user}>
      <ToastProvider>
        <ProductsPage />
      </ToastProvider>
    </CurrentUserContext.Provider>
  );
}

describe("Products no-results create action", () => {
  beforeEach(async () => {
    await db.products.clear();
    // The screen short-circuits to the "Your shelf is empty" state when
    // there are no products at all, so the search bar never renders. Seed
    // one product so the search path is reachable.
    await db.products.add({
      id: "p-existing",
      businessId: "test-business",
      sku: "SKU-1",
      barcode: "6900000000001",
      name: "Milo",
      categoryId: null,
      brandId: null,
      unitLabel: "piece",
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: 100,
      sellPrice: 150,
      expiryTracking: "off",
      expiryDate: null,
      lowStockThreshold: null,
      version: 1,
      updatedAt: new Date().toISOString(),
    });
    cleanup();
  });

  it("offers a create action that prefills the product name from the search", async () => {
    renderPage();

    const searchInput = await screen.findByLabelText(/search by name, sku, or barcode/i);
    fireEvent.change(searchInput, { target: { value: "zzz-no-such-product" } });

    const createLink = await screen.findByRole(
      "link",
      { name: /create product/i },
      { timeout: 5000 }
    );
    expect(createLink).toHaveAttribute(
      "href",
      expect.stringContaining("/products/new?name=zzz-no-such-product")
    );
  });

  it("encodes special characters in typed search queries", async () => {
    renderPage();

    const searchInput = await screen.findByLabelText(/search by name, sku, or barcode/i);
    fireEvent.change(searchInput, { target: { value: "Milk & Honey #1 + 20%" } });

    const createLink = await screen.findByRole(
      "link",
      { name: /create product/i },
      { timeout: 5000 }
    );
    expect(createLink).toHaveAttribute(
      "href",
      "/products/new?name=Milk%20%26%20Honey%20%231%20%2B%2020%25"
    );
  });

  it("offers a create action that prefills barcode when scanned from camera", async () => {
    renderPage();

    const scanBtn = await screen.findByRole("button", { name: /scan barcode to search/i });
    fireEvent.click(scanBtn);

    const simulateScanBtn = await screen.findByRole("button", { name: /simulate scan/i });
    fireEvent.click(simulateScanBtn);

    const createLink = await screen.findByRole(
      "link",
      { name: /create product with barcode/i },
      { timeout: 5000 }
    );
    expect(createLink).toHaveAttribute(
      "href",
      "/products/new?barcode=6900000000002"
    );
  });

  it("encodes special characters in scanned barcode query parameter", async () => {
    renderPage();

    const scanBtn = await screen.findByRole("button", { name: /scan barcode to search/i });
    fireEvent.click(scanBtn);

    const simulateSpecialScanBtn = await screen.findByRole("button", { name: /simulate special barcode scan/i });
    fireEvent.click(simulateSpecialScanBtn);

    const createLink = await screen.findByRole(
      "link",
      { name: /create product with barcode/i },
      { timeout: 5000 }
    );
    expect(createLink).toHaveAttribute(
      "href",
      "/products/new?barcode=BC%2F9988%2B77%231"
    );
  });

  it("switches from barcode create to name create when manually edited after scanning", async () => {
    renderPage();

    // 1. Scan barcode
    const scanBtn = await screen.findByRole("button", { name: /scan barcode to search/i });
    fireEvent.click(scanBtn);

    const simulateScanBtn = await screen.findByRole("button", { name: /simulate scan/i });
    fireEvent.click(simulateScanBtn);

    expect(await screen.findByRole("link", { name: /create product with barcode/i })).toBeInTheDocument();

    // 2. User edits the search box manually
    const searchInput = screen.getByLabelText(/search by name, sku, or barcode/i);
    fireEvent.change(searchInput, { target: { value: "Manually Typed Name" } });

    // 3. Action switches to name-based create once debounce settles
    await waitFor(() => {
      const createLink = screen.getByRole("link", { name: /^create product$/i });
      expect(createLink).toHaveAttribute(
        "href",
        "/products/new?name=Manually%20Typed%20Name"
      );
    });
  });

  it("restores the product list and clears search when clear button is clicked", async () => {
    renderPage();

    const searchInput = await screen.findByLabelText(/search by name, sku, or barcode/i);
    fireEvent.change(searchInput, { target: { value: "zzz-non-existent" } });

    const clearBtn = await screen.findByRole("button", { name: /clear search filter/i }, { timeout: 5000 });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(screen.queryByText(/no results for/i)).not.toBeInTheDocument();
      expect(screen.getByText("Milo")).toBeInTheDocument();
    });
  });

  it("does not offer a create action to a role without MANAGE_PRODUCTS", async () => {
    const worker: CurrentUser = {
      id: "user-worker",
      fullName: "Worker",
      accountType: "WORKER",
      permissions: ["VIEW_PRODUCTS"],
    };
    renderPage(worker);

    const searchInput = await screen.findByLabelText(/search by name, sku, or barcode/i);
    fireEvent.change(searchInput, { target: { value: "zzz-no-such-product" } });

    await waitFor(() => {
      expect(screen.getByText(/no results for/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("link", { name: /create product/i })).not.toBeInTheDocument();
  });

  it("renders PermissionDenied when user lacks VIEW_PRODUCTS capability", async () => {
    const workerWithoutView: CurrentUser = {
      id: "user-restricted",
      fullName: "Restricted Worker",
      accountType: "WORKER",
      permissions: [],
    };
    renderPage(workerWithoutView);

    expect(await screen.findByText("You don't have access to this screen")).toBeInTheDocument();
    expect(screen.getByText(/view products/i)).toBeInTheDocument();
  });
});
