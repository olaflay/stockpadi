// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TopStoreHeader } from "../TopStoreHeader";

let currentPath = "/dashboard";
let unread = 0;
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
  useAlertBadgeCount: () => unread,
}));

describe("TopStoreHeader navigation & hierarchy unification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPath = "/dashboard";
    unread = 0;
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
    expect(screen.queryByTestId("sync-indicator")).not.toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(mockOpenDrawer).toHaveBeenCalledOnce();
  });

  it("places notifications in the same header row as the drawer and dashboard title", () => {
    const { rerender } = render(<TopStoreHeader />);
    const bell = screen.getByRole("link", { name: "Notifications" });
    const title = screen.getByRole("heading", { name: "Dashboard" });
    const drawer = screen.getByRole("button", { name: "Open navigation menu" });
    expect(bell).toHaveAttribute("href", "/alerts");
    expect(bell.parentElement).toContainElement(title);
    expect(bell.parentElement).toContainElement(drawer);

    unread = 7;
    currentPath = "/work";
    rerender(<TopStoreHeader />);
    const badgeLink = screen.getByRole("link", { name: "Notifications, 7 unread" });
    expect(badgeLink).toHaveTextContent("7");
    expect(badgeLink).toHaveAttribute("href", "/work/alerts");
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
