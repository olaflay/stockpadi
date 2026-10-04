// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { M3SegmentedButton } from "../M3SegmentedButton";

describe("M3SegmentedButton", () => {
  afterEach(() => {
    cleanup();
  });

  const sampleOptions = [
    { value: "opt1", label: "Option 1" },
    { value: "opt2", label: "Option 2" },
    { value: "opt3", label: "Option 3" },
  ];

  it("renders single-select mode with correct ARIA roles and selected state", () => {
    const handleChange = vi.fn();
    render(
      <M3SegmentedButton
        type="single"
        options={sampleOptions}
        value="opt2"
        onChange={handleChange}
        ariaLabel="Sample single choice"
      />
    );

    const radiogroup = screen.getByRole("radiogroup", { name: "Sample single choice" });
    expect(radiogroup).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);

    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[2]).toHaveAttribute("aria-checked", "false");

    fireEvent.click(radios[0]);
    expect(handleChange).toHaveBeenCalledWith("opt1");
  });

  it("renders multi-select mode allowing multiple toggled options", () => {
    const handleChange = vi.fn();
    render(
      <M3SegmentedButton
        type="multi"
        options={sampleOptions}
        value={["opt1", "opt3"]}
        onChange={handleChange}
        ariaLabel="Sample multi choice"
      />
    );

    const group = screen.getByRole("group", { name: "Sample multi choice" });
    expect(group).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[2]).toHaveAttribute("aria-pressed", "true");

    // Clicking an unselected button adds it
    fireEvent.click(buttons[1]);
    expect(handleChange).toHaveBeenCalledWith(["opt1", "opt3", "opt2"]);

    // Clicking an already selected button removes it
    cleanup();
    const handleRemove = vi.fn();
    render(
      <M3SegmentedButton
        type="multi"
        options={sampleOptions}
        value={["opt1", "opt3"]}
        onChange={handleRemove}
      />
    );
    const newButtons = screen.getAllByRole("button");
    fireEvent.click(newButtons[0]);
    expect(handleRemove).toHaveBeenCalledWith(["opt3"]);
  });

  it("disables options with disabled attribute", () => {
    const disabledOptions = [
      { value: "a", label: "A" },
      { value: "b", label: "B", disabled: true },
    ];
    render(
      <M3SegmentedButton
        type="single"
        options={disabledOptions}
        value="a"
        onChange={vi.fn()}
      />
    );

    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toBeDisabled();
  });
});
