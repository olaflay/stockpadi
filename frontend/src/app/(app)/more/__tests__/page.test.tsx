// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import { ThemeProvider } from "@/features/settings/ThemeProvider";
import type { CurrentUser } from "@/features/auth/use-current-user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/more",
}));

vi.mock("@/features/expenses/components/AddExpenseSheet", () => ({
  AddExpenseSheet: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div role="dialog" aria-label="Record expense or delivery" /> : null,
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
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
    expect(screen.getByText("Money and contacts")).toBeInTheDocument();
    expect(screen.getByText("Contacts and debtors")).toBeInTheDocument();
    expect(screen.getByText("Sales and receipts")).toBeInTheDocument();
    expect(screen.getByText("Expenses")).toBeInTheDocument();
    expect(screen.getByText("Stock")).toBeInTheDocument();
    expect(screen.getByText("Stock count")).toBeInTheDocument();
    expect(screen.getByText("Close day")).toBeInTheDocument();
    expect(screen.getByText("Store and staff settings")).toBeInTheDocument();
    expect(screen.getByText("Product imports")).toBeInTheDocument();
    expect(screen.queryByText("Data, Sync & Backups")).not.toBeInTheDocument();
    expect(screen.queryByText("Help & Support")).not.toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Record expense or delivery" }));
    expect(screen.getByRole("dialog", { name: "Record expense or delivery" })).toBeInTheDocument();
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
    expect(screen.getByText("Sales and receipts")).toBeInTheDocument();
    // Worker does NOT have MANAGE_EXPENSES, VIEW_CUSTOMERS, or admin settings
    expect(screen.queryByText("Expenses")).not.toBeInTheDocument();
    expect(screen.queryByText("Contacts and debtors")).not.toBeInTheDocument();
    expect(screen.queryByText("Store and staff settings")).not.toBeInTheDocument();
    // Worker has access to App Settings and Sign Out
    expect(screen.getByText("App settings")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
  });
});
