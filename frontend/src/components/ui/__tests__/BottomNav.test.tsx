// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { BottomNav } from "../BottomNav";
import type { CurrentUser } from "@/features/auth/use-current-user";

let currentPath = "/dashboard";
let currentUser: CurrentUser = {
  id: "user-owner",
  fullName: "Owner User",
  accountType: "BUSINESS_OWNER",
};

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => currentUser,
}));

vi.mock("@/components/ui/NavigationContext", () => ({
  useNavigation: () => ({ isNavVisible: true }),
}));

vi.mock("@/components/ui/AlertBadge", () => ({
  AlertBadge: () => <span data-testid="alert-badge" />,
}));

describe("BottomNav component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPath = "/dashboard";
    currentUser = {
      id: "user-owner",
      fullName: "Owner User",
      accountType: "BUSINESS_OWNER",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render when on a sub-route or settings page", () => {
    currentPath = "/settings/profile";
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();

    cleanup();

    currentPath = "/sales/sale-123";
    const { container: saleContainer } = render(<BottomNav />);
    expect(saleContainer.firstChild).toBeNull();
  });

  it("renders 5 owner tabs when user is a business owner", () => {
    currentPath = "/dashboard";
    render(<BottomNav />);

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Sell")).toBeDefined();
    expect(screen.getByText("Products")).toBeDefined();
    expect(screen.getByText("Reports")).toBeDefined();
    expect(screen.getByText("More")).toBeDefined();

    // Active tab has aria-current="page"
    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink.getAttribute("aria-current")).toBe("page");

    const sellLink = screen.getByRole("link", { name: /sell/i });
    expect(sellLink.getAttribute("aria-current")).toBeNull();
  });

  it("renders worker tabs including Stock count for worker", () => {
    currentUser = {
      id: "user-worker",
      fullName: "Staff Worker",
      accountType: "WORKER",
      permissions: ["POS_SELL", "VIEW_PRODUCTS", "SUBMIT_STOCK_COUNT"],
    };
    currentPath = "/stock-count";

    render(<BottomNav />);

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Sell")).toBeDefined();
    expect(screen.getByText("Products")).toBeDefined();
    expect(screen.getByText("Stock")).toBeDefined();
    expect(screen.getByText("More")).toBeDefined();
    expect(screen.queryByText("Reports")).toBeNull();

    const stockLink = screen.getByRole("link", { name: /stock/i });
    expect(stockLink.getAttribute("aria-current")).toBe("page");
  });

  it("omits tabs when worker lacks capabilities", () => {
    currentUser = {
      id: "user-limited",
      fullName: "Limited Worker",
      accountType: "WORKER",
      permissions: [], // No permissions
    };
    currentPath = "/more";

    render(<BottomNav />);

    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("More")).toBeDefined();
    expect(screen.queryByText("Sell")).toBeNull();
    expect(screen.queryByText("Stock")).toBeNull();
    expect(screen.queryByText("Products")).toBeNull();
  });
});
