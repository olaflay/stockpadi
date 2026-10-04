// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SegmentedControl } from "../SegmentedControl";

describe("SegmentedControl component (M3 Segmented Button)", () => {
  afterEach(() => {
    cleanup();
  });

  const options = [
    { value: "overview", label: "Overview" },
    { value: "sales", label: "Daily Sales" },
    { value: "inventory", label: "Stock & Shelves" },
  ];

  it("renders all options as tabs in a tablist", () => {
    render(
      <SegmentedControl
        options={options}
        selected="overview"
        onChange={vi.fn()}
        ariaLabel="Report views"
      />
    );

    const tablist = screen.getByRole("tablist", { name: "Report views" });
    expect(tablist).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Daily Sales" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Stock & Shelves" })).toBeInTheDocument();
  });

  it("marks the active option with aria-selected='true'", () => {
    render(
      <SegmentedControl
        options={options}
        selected="sales"
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Daily Sales" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Stock & Shelves" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange when an option is clicked", () => {
    const handleChange = vi.fn();
    render(
      <SegmentedControl
        options={options}
        selected="overview"
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Stock & Shelves" }));
    expect(handleChange).toHaveBeenCalledWith("inventory");
  });
});
