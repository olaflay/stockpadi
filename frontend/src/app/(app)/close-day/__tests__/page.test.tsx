// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/lib/db";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import type { CurrentUser } from "@/features/auth/use-current-user";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/close-day",
}));

vi.mock("@/features/reconciliation/reconciliation-client", () => ({
  fetchReconciliationHistory: vi.fn().mockResolvedValue({ records: [] }),
  submitReconciliation: vi.fn().mockResolvedValue({ id: "rec-1" }),
}));

const { default: CloseDayPage } = await import("@/app/(app)/close-day/page");

function renderAs(user: CurrentUser) {
  return render(
    <CurrentUserContext.Provider value={user}>
      <CloseDayPage />
    </CurrentUserContext.Provider>
  );
}

describe("CloseDayPage testing", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.products.clear();
    await db.expenses.clear();
    await db.branches.clear();
    cleanup();
  });

  it("renders without error for a business owner with basic data", async () => {
    renderAs({ id: "user-owner", fullName: "Owner", role: "owner", accountType: "BUSINESS_OWNER" });

    // Expect not to show "Couldn't load today's sales"
    expect(await screen.findByText("Today's total sales")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load today's sales.")).not.toBeInTheDocument();
  });
});
