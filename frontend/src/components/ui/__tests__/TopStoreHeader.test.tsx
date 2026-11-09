// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TopStoreHeader } from "../TopStoreHeader";

let currentPath = "/dashboard";
const mockOpenDrawer = vi.fn();
const mockBack = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: vi.fn(),
  }),
}));

vi.mock("@/components/ui/DrawerContext", () => ({
  useSideDrawer: () => ({
    openDrawer: mockOpenDrawer,
    closeDrawer: vi.fn(),
    isOpen: false,
  }),
}));

vi.mock("@/components/ui/SyncIndicator", () => ({
  SyncIndicator: () => <div data-testid="sync-indicator" />,
}));

vi.mock("@/features/alerts/use-alert-center", () => ({
  useAlertBadgeCount: () => 0,
}));

describe("TopStoreHeader navigation & hierarchy unification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPath = "/dashboard";
  });

  afterEach(() => {
    cleanup();
  });

  it("renders hamburger menu button on root dashboard screen and opens drawer on tap", () => {
    currentPath = "/dashboard";
    render(<TopStoreHeader />);

    const menuButton = screen.getByRole("button", { name: /open navigation menu/i });
    expect(menuButton).toBeDefined();
    expect(screen.queryByRole("button", { name: /go back/i })).toBeNull();
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByTestId("sync-indicator")).toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(mockOpenDrawer).toHaveBeenCalledOnce();
  });

  it("renders hamburger menu button on root products screen", () => {
    currentPath = "/products";
    render(<TopStoreHeader />);

    expect(screen.getByRole("button", { name: /open navigation menu/i })).toBeDefined();
    expect(screen.queryByRole("button", { name: /go back/i })).toBeNull();
    expect(screen.getByText("Products")).toBeDefined();
  });

  it("transforms to back button on child sub-screens like /products/new and falls back to parent route", () => {
    currentPath = "/products/new";
    render(<TopStoreHeader />);

    // Must NOT render drawer menu button on a child flow
    expect(screen.queryByRole("button", { name: /open navigation menu/i })).toBeNull();

    // Must render back button
    const backButton = screen.getByRole("button", { name: /go back/i });
    expect(backButton).toBeDefined();
    expect(screen.getByText("Add product")).toBeDefined();

    fireEvent.click(backButton);
    // In jsdom with empty history stack, it safely navigates to /products
    expect(mockReplace).toHaveBeenCalledWith("/products");
  });

  it("transforms to back button on settings sub-screens like /settings/branches", () => {
    currentPath = "/settings/branches";
    render(<TopStoreHeader />);

    expect(screen.queryByRole("button", { name: /open navigation menu/i })).toBeNull();
    const backButton = screen.getByRole("button", { name: /go back/i });
    expect(backButton).toBeDefined();
    expect(screen.getByText("Branches")).toBeDefined();

    fireEvent.click(backButton);
    expect(mockReplace).toHaveBeenCalledWith("/settings");
  });

  it("transforms to back button on sales secondary hub and navigates back to dashboard", () => {
    currentPath = "/sales";
    render(<TopStoreHeader />);

    expect(screen.queryByRole("button", { name: /open navigation menu/i })).toBeNull();
    const backButton = screen.getByRole("button", { name: /go back/i });
    expect(backButton).toBeDefined();
    expect(screen.getByText("Sales & receipts")).toBeDefined();

    fireEvent.click(backButton);
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });
});
