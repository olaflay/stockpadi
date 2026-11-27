// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { localDateKey, localDayBounds } from "@/lib/date";
import type { Sale } from "@/types/sale";
import { DashboardSalesCard } from "./DashboardSalesCard";

afterEach(cleanup);

it("shows the selected day's non-voided sales, scoped to the worker's branch and own receipts", async () => {
  await db.sales.clear();
  const now = new Date();
  const historical = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const day = localDateKey(historical);
  const bounds = localDayBounds(day)!;
  function sale(id: string, overrides: Partial<Sale> = {}): Sale {
    return {
      id, clientId: id, businessId: "test-business", branchId: "main",
      createdAtLocal: bounds.start, createdAt: bounds.start, createdByUserId: "cashier",
      customerId: null, items: [], subtotal: 100, discount: 0, total: 100, voidedAt: null,
      payments: [{ method: "cash", amount: 60 }, { method: "credit", amount: 30 }, { method: "transfer", amount: 10 }],
      ...overrides,
    };
  }
  await db.sales.bulkAdd([
    sale("own"), sale("different-user", { createdByUserId: "other" }),
    sale("different-branch", { branchId: "other" }),
    sale("voided", { voidedAt: bounds.start }),
    sale("next-day", { createdAtLocal: bounds.end }),
  ]);
  render(<DashboardSalesCard branchId="main" viewerId="cashier" branchIds={["main"]} />);
  expect(await screen.findByText("0 sales recorded")).toBeInTheDocument();
  const dateInput = screen.getByLabelText("Sales date");
  expect(dateInput).toHaveAttribute("type", "date");
  fireEvent.pointerDown(dateInput);
  fireEvent.click(dateInput);
  fireEvent.keyDown(dateInput, { key: "Escape" });
  // Native Cancel does not emit a change or reliably blur. Pointer focus still
  // must not paint a persistent ring or update the selected date.
  expect(dateInput.parentElement).not.toHaveClass("has-[:focus-visible]:ring-2");
  expect(screen.getByText("0 sales recorded")).toBeInTheDocument();
  fireEvent.change(dateInput, { target: { value: day } });
  expect(await screen.findByText("1 sale")).toBeInTheDocument();
  expect(screen.getByText(/60.* cash$/)).toBeInTheDocument();
  expect(screen.getByText(/30.* credit$/)).toBeInTheDocument();
  expect(screen.getByText(/10.* other payments$/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View sales & receipts" })).toHaveAttribute("href", `/sales?date=${day}&branch=main&own=1`);
});
