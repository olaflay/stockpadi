// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "../TooltipContext";
import { InfoTooltip } from "../InfoTooltip";

describe("InfoTooltip singleton behavior", () => {
  afterEach(() => {
    cleanup();
  });

  it("only allows one tooltip to be open at a time", () => {
    render(
      <TooltipProvider>
        <div>
          <span data-testid="container-1">
            <InfoTooltip text="First explanation text" />
          </span>
          <span data-testid="container-2">
            <InfoTooltip text="Second explanation text" />
          </span>
        </div>
      </TooltipProvider>
    );

    const buttons = screen.getAllByRole("button", { name: "More information" });
    expect(buttons).toHaveLength(2);

    // Open first tooltip
    fireEvent.click(buttons[0]);
    expect(screen.getByText("First explanation text")).toBeInTheDocument();
    expect(screen.queryByText("Second explanation text")).not.toBeInTheDocument();

    // Open second tooltip — first one should close automatically
    fireEvent.click(buttons[1]);
    expect(screen.queryByText("First explanation text")).not.toBeInTheDocument();
    expect(screen.getByText("Second explanation text")).toBeInTheDocument();
  });
});
