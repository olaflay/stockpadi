// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FAB } from "../FAB";

describe("FAB", () => {
  afterEach(cleanup);

  it("uses the shared M3 rounded-square shape for modal actions", () => {
    const onClick = vi.fn();
    render(<FAB onClick={onClick} label="Add contact"><span aria-hidden>+</span></FAB>);

    const action = screen.getByRole("button", { name: "Add contact" });
    expect(action).toHaveClass("rounded-2xl");
    expect(action).not.toHaveClass("rounded-full");
    fireEvent.click(action);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
