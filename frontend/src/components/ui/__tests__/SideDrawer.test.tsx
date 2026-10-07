// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { SideDrawer } from "../SideDrawer";
import type { CurrentUser } from "@/features/auth/use-current-user";

let isOpen = true;
const closeDrawer = vi.fn();
let currentPath = "/dashboard";
let currentUser: CurrentUser = {
  id: "user-owner",
  fullName: "Owner User",
  accountType: "BUSINESS_OWNER",
};

vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => currentUser,
}));

vi.mock("@/components/ui/DrawerContext", () => ({
  useSideDrawer: () => ({
    isOpen,
    closeDrawer,
    openDrawer: vi.fn(),
    toggleDrawer: vi.fn(),
  }),
}));

vi.mock("@/components/ui/ThemeToggle", () => ({
  ThemeToggle: () => <button data-testid="theme-toggle">Theme</button>,
}));

vi.mock("@/features/auth/logout", () => ({
  signOut: vi.fn(),
}));

describe("SideDrawer component (Material UI / M3 Specification)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isOpen = true;
    currentPath = "/dashboard";
    currentUser = {
      id: "user-owner",
      fullName: "Alhassan Danladi",
      accountType: "BUSINESS_OWNER",
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Material UI standard section groupings: Daily Operations, People & Contacts, Business & Settings", () => {
    render(<SideDrawer />);

    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
    expect(screen.getByText("People & Contacts")).toBeInTheDocument();
    expect(screen.getByText("Business & Settings")).toBeInTheDocument();

    // Check core operations
    expect(screen.getByText("Sales History")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Close Day Register")).toBeInTheDocument();
    expect(screen.getByText("Contacts & Debtors")).toBeInTheDocument();
    expect(screen.getByText("Purchases & Restock")).toBeInTheDocument();

    // Check management
    expect(screen.getByText("Business Profile")).toBeInTheDocument();
    expect(screen.getByText("Staff & Permissions")).toBeInTheDocument();

    // Check footer
    expect(screen.getByText("Help & Support")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("hides owner-only sections like Staff & Permissions for workers", () => {
    currentUser = {
      id: "worker-1",
      fullName: "Cashier Staff",
      accountType: "WORKER",
      role: "cashier",
      permissions: ["POS_SELL"],
    };

    render(<SideDrawer />);

    expect(screen.queryByText("Staff & Permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("Backup & Offline Storage")).not.toBeInTheDocument();
  });

  it("keeps the drawer above bottom navigation and its footer in the mobile safe area", () => {
    render(<SideDrawer />);

    const drawer = screen.getByRole("complementary", { name: "Navigation drawer" });
    expect(drawer.className).toContain("z-[var(--z-drawer)]");
    expect(drawer.className).toContain("h-dvh");
    expect(drawer.className).toContain("max-h-dvh");
    expect(screen.getByText("Sign Out").parentElement?.parentElement?.className).toContain("safe-area-inset-bottom");
  });
});
