// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/features/settings/ThemeProvider";
import type { CurrentUser } from "@/features/auth/use-current-user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/more",
}));

const { default: MorePage } = await import("@/app/(app)/more/page");

function renderAs(user: CurrentUser) {
  return render(
    <ThemeProvider>
      <CurrentUserContext.Provider value={user}>
        <MorePage />
      </CurrentUserContext.Provider>
    </ThemeProvider>
  );
}

describe("More Page — Operations & Settings Hub", () => {
  beforeEach(async () => {
    cleanup();
  });

  it("renders full business operations and management sections for a Business Owner", async () => {
    renderAs({
      id: "owner-1",
      fullName: "Alhaji Musa",
      role: "owner",
      accountType: "BUSINESS_OWNER",
    });

    expect(await screen.findByText("More")).toBeInTheDocument();
    expect(screen.getByText("Alhaji Musa · Profile & details")).toBeInTheDocument();
    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
    expect(screen.getByText("Customers & Debts")).toBeInTheDocument();
    expect(screen.getByText("Sales & Receipts")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Purchases & Restock")).toBeInTheDocument();
    expect(screen.getByText("Stock Count")).toBeInTheDocument();
    expect(screen.getByText("Close Day")).toBeInTheDocument();
    expect(screen.getByText("Store & POS Settings")).toBeInTheDocument();
    expect(screen.getByText("Staff & Permissions")).toBeInTheDocument();
    expect(screen.getByText("Import / Export Products")).toBeInTheDocument();
    expect(screen.getByText("Backup & Data Sync")).toBeInTheDocument();
    expect(screen.getByText("Help & Support")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("scopes worker visibility to permitted operations and hides owner-only settings", async () => {
    renderAs({
      id: "worker-1",
      fullName: "Chioma Cashier",
      role: "cashier",
      accountType: "WORKER",
      permissions: ["VIEW_OWN_SALES", "POS_SELL"],
    });

    expect(await screen.findByText("More")).toBeInTheDocument();
    // Worker sees Sales & Receipts because of VIEW_OWN_SALES
    expect(screen.getByText("Sales & Receipts")).toBeInTheDocument();
    // Worker does NOT have MANAGE_EXPENSES, VIEW_CUSTOMERS, or admin settings
    expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers & Debts")).not.toBeInTheDocument();
    expect(screen.queryByText("Store & POS Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Staff & Permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("Backup & Data Sync")).not.toBeInTheDocument();
    // Still has access to Help and Sign Out
    expect(screen.getByText("Help & Support")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });
});
