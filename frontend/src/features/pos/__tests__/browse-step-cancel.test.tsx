// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BrowseStep } from "../components/BrowseStep";
import { ToastProvider } from "@/components/ui/Toast";
import { NavigationProvider } from "@/components/ui/NavigationContext";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/pos",
}));

describe("BrowseStep Cancel / Clear Selection", () => {
  afterEach(cleanup);
  const dummyProps = {
    query: "",
    onQueryChange: vi.fn(),
    categories: [],
    selectedCategoryId: null,
    onSelectCategory: vi.fn(),
    filteredProducts: [],
    allProducts: [],
    cart: {},
    onAddToCart: vi.fn(),
    onIncrementLine: vi.fn(),
    onDecrementLine: vi.fn(),
    itemCount: 2,
    total: 3500,
    onReviewCart: vi.fn(),
    onClearCart: vi.fn(),
    onGoToSettings: vi.fn(),
  };

  function renderBrowseStep(props = dummyProps) {
    return render(
      <NavigationProvider>
        <ToastProvider>
          <BrowseStep {...props} />
        </ToastProvider>
      </NavigationProvider>
    );
  }

  it("renders the Cancel button when items are selected", () => {
    renderBrowseStep();
    const cancelBtn = screen.getByRole("button", { name: "Cancel and clear all selected items" });
    expect(cancelBtn).toBeInTheDocument();
    expect(screen.getByText("2 items selected")).toBeInTheDocument();
  });

  it("opens ConfirmDialog when Cancel is clicked, and calls onClearCart on confirmation", () => {
    const onClearCart = vi.fn();
    renderBrowseStep({ ...dummyProps, onClearCart });

    const cancelBtn = screen.getByRole("button", { name: "Cancel and clear all selected items" });
    fireEvent.click(cancelBtn);

    expect(screen.getByText("Cancel current sale?")).toBeInTheDocument();
    expect(screen.getByText("All selected items will be removed from this order.")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Clear sale" });
    fireEvent.click(confirmBtn);

    expect(onClearCart).toHaveBeenCalledTimes(1);
  });

  it("does not call onClearCart when dialog is dismissed", () => {
    const onClearCart = vi.fn();
    renderBrowseStep({ ...dummyProps, onClearCart });

    const cancelBtn = screen.getByRole("button", { name: "Cancel and clear all selected items" });
    fireEvent.click(cancelBtn);

    const dismissBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(dismissBtn);

    expect(onClearCart).not.toHaveBeenCalled();
  });
});
