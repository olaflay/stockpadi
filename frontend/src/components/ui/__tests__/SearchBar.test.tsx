// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchBar } from "../SearchBar";

describe("SearchBar component", () => {
  it("renders with placeholder, tokenized radius, and responds to change", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <SearchBar
        value=""
        onChange={handleChange}
        placeholder="Search products..."
      />
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("h-12");
    expect(root.className).toContain("min-h-12");
    expect(root.className).toContain("rounded-[var(--radius-control)]");

    const input = screen.getByPlaceholderText("Search products...");
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: "malt" } });
    expect(handleChange).toHaveBeenCalledWith("malt");
  });

  it("shows clear button with accessible touch target and tactile press feedback", () => {
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

    // Accessible touch target
    expect(clearBtn.className).toContain("min-h-[44px]");
    expect(clearBtn.className).toContain("min-w-[44px]");
    expect(clearBtn.className).toContain("h-10");
    expect(clearBtn.className).toContain("w-10");

    // Tactile press states
    expect(clearBtn.className).toContain("active:scale-[0.98]");
    expect(clearBtn.className).toContain("active:bg-surface-container-highest");
    expect(clearBtn.className).toContain("duration-[var(--motion-duration-short)]");
    expect(clearBtn.className).toContain("ease-[var(--easing-standard)]");

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

  it("uses tonal, stroke-free shapes for every compatibility variant", () => {
    const { container: startContainer } = render(
      <SearchBar
        value=""
        onChange={() => {}}
        placeholder="Search..."
        shape="segmented-start"
      />
    );
    expect((startContainer.firstElementChild as HTMLElement).className).toContain("rounded-[var(--radius-control)]");
    expect((startContainer.firstElementChild as HTMLElement).className).not.toContain("border");

    const { container: middleContainer } = render(
      <SearchBar
        value=""
        onChange={() => {}}
        placeholder="Search..."
        shape="segmented-middle"
      />
    );
    expect((middleContainer.firstElementChild as HTMLElement).className).toContain("rounded-[var(--radius-control)]");

    const { container: endContainer } = render(
      <SearchBar
        value=""
        onChange={() => {}}
        placeholder="Search..."
        shape="segmented-end"
      />
    );
    expect((endContainer.firstElementChild as HTMLElement).className).toContain("rounded-[var(--radius-control)]");

    const { container: standaloneContainer } = render(
      <SearchBar
        value=""
        onChange={() => {}}
        placeholder="Search..."
        shape="standalone"
      />
    );
    expect((standaloneContainer.firstElementChild as HTMLElement).className).toContain("rounded-[var(--radius-control)]");
  });
});
