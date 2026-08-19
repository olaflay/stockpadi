// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/lib/db";
import { CurrentUserContext } from "@/features/auth/AuthProvider";
import type { CurrentUser } from "@/features/auth/use-current-user";

/**
 * Role-gating smoke test for Reports, mirroring
 * src/app/(app)/pos/__tests__/page.test.tsx. Cashier has no view_reports
 * permission per PERMISSION_MATRIX and must see PermissionDenied instead
 * of the reports body.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/reports",
}));

const { default: ReportsPage } = await import("@/app/(app)/reports/page");

function renderAs(user: CurrentUser) {
  return render(
    <CurrentUserContext.Provider value={user}>
      <ReportsPage />
    </CurrentUserContext.Provider>
  );
}

describe("Reports page role gating", () => {
  beforeEach(async () => {
    await db.sales.clear();
    await db.products.clear();
    cleanup();
  });

  it("renders PermissionDenied for a Worker account", async () => {
    renderAs({ id: "user-1", fullName: "Worker", role: "cashier", accountType: "WORKER" });

    expect(await screen.findByText("You don't have access to this screen")).toBeInTheDocument();
  });

  it("does not render PermissionDenied for owner", async () => {
    renderAs({ id: "user-2", fullName: "Owner", role: "owner", accountType: "BUSINESS_OWNER" });

    await screen.findByText("Reports");
    expect(screen.queryByText("You don't have access to this screen")).not.toBeInTheDocument();
  });

});
