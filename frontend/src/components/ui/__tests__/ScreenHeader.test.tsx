// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ScreenHeader } from "../ScreenHeader";

const mockReplace = vi.fn();
const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack }),
  usePathname: () => "/products/new",
}));

describe("ScreenHeader primitive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders title with standardized title-lg typography token and 48x48px back touch target", () => {
    render(<ScreenHeader title="New Product" />);

    const heading = screen.getByRole("heading", { level: 1, name: "New Product" });
    expect(heading).toBeDefined();
    expect(heading.className).toContain("text-[length:var(--font-size-title-lg)]");

    const backButton = screen.getByRole("button", { name: "Go back" });
    expect(backButton).toBeDefined();
    // 48x48px touch target verification
    expect(backButton.className).toContain("min-h-[48px]");
    expect(backButton.className).toContain("min-w-[48px]");
    expect(backButton.className).toContain("h-12");
    expect(backButton.className).toContain("w-12");

    // Tactile micro-interaction feedback
    expect(backButton.className).toContain("active:scale-[0.98]");
    expect(backButton.className).toContain("active:bg-surface-container-high");
    expect(backButton.className).toContain("duration-[var(--motion-duration-short)]");
    expect(backButton.className).toContain("ease-[var(--easing-standard)]");
  });

  it("triggers custom onBack when provided", () => {
    const handleBack = vi.fn();
    render(<ScreenHeader title="Product Details" onBack={handleBack} />);

    const backButton = screen.getByRole("button", { name: "Go back" });
    fireEvent.click(backButton);
    expect(handleBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("navigates via router.replace when backHref is provided", () => {
    render(<ScreenHeader title="Edit Product" backHref="/products" />);

    const backButton = screen.getByRole("button", { name: "Go back" });
    fireEvent.click(backButton);
    expect(mockReplace).toHaveBeenCalledWith("/products");
  });

  it("supports hideBack mode with action rendered cleanly", () => {
    render(
      <ScreenHeader
        title="Inventory"
        hideBack
        action={<button data-testid="export-btn">Export</button>}
      />
    );

    expect(screen.queryByRole("button", { name: "Go back" })).toBeNull();
    const heading = screen.getByRole("heading", { level: 1, name: "Inventory" });
    expect(heading.className).toContain("sr-only");
    expect(screen.getByTestId("export-btn")).toBeDefined();
  });
});
