// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Button } from "../Button";

describe("Button primitive", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders with default primary variant, medium size and 48px touch target floor", () => {
    render(<Button>Confirm Sale</Button>);
    const button = screen.getByRole("button", { name: "Confirm Sale" });
    expect(button).toBeDefined();

    // 48px touch target floor
    expect(button.className).toContain("min-h-[48px]");
    // Radius control token
    expect(button.className).toContain("rounded-[var(--radius-control)]");
    // Tactile feedback
    expect(button.className).toContain("active:scale-[0.98]");
    expect(button.className).toContain("active:brightness-95");
    expect(button.className).toContain("duration-[var(--motion-duration-short)]");
    expect(button.className).toContain("ease-[var(--easing-standard)]");
    // Elevation
    expect(button.className).toContain("shadow-elevation-1");
  });

  it("supports all semantic variants with expected contrast and state layers", () => {
    const { rerender } = render(<Button variant="secondary">Cancel</Button>);
    let button = screen.getByRole("button", { name: "Cancel" });
    expect(button.className).toContain("border-border");
    expect(button.className).toContain("active:bg-surface-container-high");

    rerender(<Button variant="tonal">Save Draft</Button>);
    button = screen.getByRole("button", { name: "Save Draft" });
    expect(button.className).toContain("bg-surface-container");
    expect(button.className).toContain("active:bg-surface-container-highest");

    rerender(<Button variant="danger">Delete Item</Button>);
    button = screen.getByRole("button", { name: "Delete Item" });
    expect(button.className).toContain("bg-danger");
    expect(button.className).toContain("text-on-danger");

    rerender(<Button variant="ghost">Skip</Button>);
    button = screen.getByRole("button", { name: "Skip" });
    expect(button.className).toContain("bg-transparent");
  });

  it("applies tabular-nums when hasTabularFigures is set", () => {
    render(
      <Button hasTabularFigures>
        <span>₦ 45,000</span>
      </Button>
    );
    const button = screen.getByRole("button");
    expect(button.className).toContain("tabular-nums");
  });

  it("handles loading state with spinner and aria-busy", () => {
    render(
      <Button isLoading loadingText="Saving...">
        Save
      </Button>
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
    expect(screen.getByText("Saving...")).toBeDefined();
  });

  it("forwards click events and ref correctly", () => {
    const handleClick = vi.fn();
    const testRef = React.createRef<HTMLButtonElement>();

    render(
      <Button ref={testRef} onClick={handleClick}>
        Tap Me
      </Button>
    );

    const button = screen.getByRole("button", { name: "Tap Me" });
    expect(testRef.current).toBe(button);

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
