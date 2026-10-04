// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FilterDropdownBar, type FilterGroup } from "../FilterDropdownBar";
import { MonthGroupHeader } from "../MonthGroupHeader";
import { TransactionItemRow } from "../TransactionItemRow";
import { Receipt } from "lucide-react";

describe("FilterDropdownBar", () => {
  afterEach(() => {
    cleanup();
  });

  const mockFilters: FilterGroup[] = [
    {
      id: "payment",
      label: "All Payment Methods",
      options: [
        { value: "all", label: "All Payment Methods" },
        { value: "cash", label: "Cash" },
        { value: "transfer", label: "Bank Transfer" },
        { value: "pos", label: "POS" },
      ],
      selectedValue: "all",
      onChange: vi.fn(),
    },
    {
      id: "category",
      label: "All Categories",
      options: [
        { value: "all", label: "All Categories" },
        { value: "groceries", label: "Groceries" },
      ],
      selectedValue: "all",
      onChange: vi.fn(),
    },
  ];

  it("renders top filter buttons with chevron down", () => {
    render(<FilterDropdownBar filters={mockFilters} />);
    expect(screen.getByText("All Payment Methods")).toBeDefined();
    expect(screen.getByText("All Categories")).toBeDefined();
  });

  it("opens expanding tray with pill options when button is clicked", () => {
    render(<FilterDropdownBar filters={mockFilters} />);
    const paymentBtn = screen.getByRole("button", { name: /all payment methods/i });
    fireEvent.click(paymentBtn);

    expect(screen.getByRole("option", { name: "Cash" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Bank Transfer" })).toBeDefined();
    expect(screen.getByRole("option", { name: "POS" })).toBeDefined();
  });

  it("calls onChange and closes tray when an option is selected", () => {
    const onChange = vi.fn();
    const filtersWithSpy = [
      { ...mockFilters[0], onChange },
      mockFilters[1],
    ];
    render(<FilterDropdownBar filters={filtersWithSpy} />);
    const paymentBtn = screen.getByRole("button", { name: /all payment methods/i });
    fireEvent.click(paymentBtn);

    const cashOption = screen.getByRole("option", { name: "Cash" });
    fireEvent.click(cashOption);

    expect(onChange).toHaveBeenCalledWith("cash");
  });
});

describe("MonthGroupHeader", () => {
  it("renders title, in/out metrics and Analysis button", () => {
    render(
      <MonthGroupHeader
        title="Oct 2026"
        inflow={73702}
        outflow={67670}
        analysisHref="/reports"
      />
    );
    expect(screen.getByText("Oct 2026")).toBeDefined();
    expect(screen.getByText("In:")).toBeDefined();
    expect(screen.getByText("Out:")).toBeDefined();
    const analysisLink = screen.getByRole("link", { name: "Analysis" });
    expect(analysisLink.getAttribute("href")).toBe("/reports");
  });
});

describe("TransactionItemRow", () => {
  it("renders retail sale title, formatted timestamp, and clean amount without redundant badge", () => {
    render(
      <TransactionItemRow
        icon={<Receipt size={20} />}
        title="Sale · 3 items"
        subtitle="Oct 3rd, 20:02:18 · Cash"
        amount={84270}
      />
    );
    expect(screen.getByText("Sale · 3 items")).toBeDefined();
    expect(screen.getByText("Oct 3rd, 20:02:18 · Cash")).toBeDefined();
    expect(screen.queryByText("Successful")).toBeNull();
  });

  it("renders status badge only when sale is cancelled or owing", () => {
    render(
      <TransactionItemRow
        icon={<Receipt size={20} />}
        title="Sale · 1 item"
        subtitle="Oct 3rd, 20:00:00 · Credit"
        amount={5000}
        status="owing"
      />
    );
    expect(screen.getByText("Owing")).toBeDefined();
  });
});
