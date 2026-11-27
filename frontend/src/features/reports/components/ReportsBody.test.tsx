// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReportsBody } from "./ReportsBody";

afterEach(cleanup);

it("shows an honest zero-sales state, distinguishes unknown cost from loss, and retains each breakdown", () => {
  render(<ReportsBody
    period="week"
    onSelectPeriod={vi.fn()}
    periodSales={[]}
    periodExpenses={[]}
    periodExpensesTotal={0}
    periodPurchases={[]}
    periodPurchasesTotal={0}
    periodRefunds={[]}
    bestSellers={[]}
    lowStockProducts={[]}
    periodNetProfit={null}
    profitMetrics={{ cogs: null, costStatus: "unavailable", unavailableCostLines: 1 }}
    periodNetCashFlow={0}
  />);
  expect(screen.getByRole("heading", { name: "Net sales" })).toBeInTheDocument();
  expect(screen.getByText("No sales recorded")).toBeInTheDocument();
  expect(screen.getByText("Unavailable")).toHaveClass("text-on-surface-muted");
  expect(screen.queryByText("Deficit")).not.toBeInTheDocument();

  const profit = screen.getByRole("button", { name: "View profit breakdown" });
  expect(profit).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(profit);
  expect(screen.getByRole("button", { name: "Hide profit breakdown" })).toHaveAttribute("aria-expanded", "true");

  fireEvent.click(screen.getByRole("button", { name: "View cash breakdown" }));
  expect(screen.getByRole("button", { name: "Hide cash breakdown" })).toHaveAttribute("aria-expanded", "true");
});
