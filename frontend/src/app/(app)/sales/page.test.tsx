// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { localDayBounds } from "@/lib/date";
import type { Sale } from "@/types/sale";
import SalesPage from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sales",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("date=2026-01-15&branch=main&own=1"),
}));
vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => ({
    id: "cashier", accountType: "WORKER", role: "cashier",
    branchIds: ["main", "other"], capabilities: ["VIEW_OWN_SALES", "VIEW_BRANCH_SALES"],
  }),
}));
vi.mock("@/features/auth/authorization", () => ({
  hasCapability: (_user: unknown, ability: string) => ["VIEW_OWN_SALES", "VIEW_BRANCH_SALES"].includes(ability),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("opens receipts for the dashboard date, branch, and cashier only", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} });
  await db.sales.clear();
  const bounds = localDayBounds("2026-01-15")!;
  const base: Omit<Sale, "id" | "clientId"> = {
    businessId: "test-business", branchId: "main", createdAtLocal: bounds.start,
    createdAt: bounds.start, createdByUserId: "cashier", customerId: null, items: [],
    subtotal: 100, discount: 0, total: 100, voidedAt: null, payments: [{ method: "cash", amount: 100 }],
  };
  await db.sales.bulkAdd([
    { ...base, id: "own-receipt", clientId: "own-receipt" },
    { ...base, id: "other-user", clientId: "other-user", createdByUserId: "teammate" },
    { ...base, id: "other-branch", clientId: "other-branch", branchId: "other" },
    { ...base, id: "next-day", clientId: "next-day", createdAtLocal: bounds.end },
  ]);
  render(<SalesPage />);
  await screen.findByText("15 Jan 2026");
  const receipts = screen.getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href) => href?.startsWith("/sales/"));
  expect(receipts).toEqual(["/sales/own-receipt"]);
});
