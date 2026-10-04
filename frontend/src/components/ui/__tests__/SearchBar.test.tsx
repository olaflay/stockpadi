// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "../SearchBar";

describe("SearchBar component", () => {
  it("renders with placeholder and responds to change", () => {
    const handleChange = vi.fn();
    render(
      <SearchBar
        value=""
        onChange={handleChange}
        placeholder="Search products..."
      />
    );

    const input = screen.getByPlaceholderText("Search products...");
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: "malt" } });
    expect(handleChange).toHaveBeenCalledWith("malt");
  });

  it("shows clear button when value is non-empty and clears input on click", () => {
    const handleChange = vi.fn();
    render(
      <SearchBar
        value="malt"
        onChange={handleChange}
        placeholder="Search products..."
      />
    );

    const clearBtn = screen.getByLabelText("Clear search");
    expect(clearBtn).toBeDefined();

    fireEvent.click(clearBtn);
    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("renders trailing action if provided", () => {
    render(
      <SearchBar
        value=""
        onChange={() => {}}
        placeholder="Search..."
        trailingAction={<button data-testid="scan-btn">Scan</button>}
      />
    );

    expect(screen.getByTestId("scan-btn")).toBeDefined();
  });
});
