// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ShortDateInput } from "@/components/ui/ShortDateInput";

describe("ShortDateInput Component", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with placeholder and value", () => {
    render(<ShortDateInput value="2026-09-01" onChange={() => {}} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("01/09/26");
  });

  it("calls scrollIntoView when focused", async () => {
    render(<ShortDateInput value="" onChange={() => {}} />);
    const input = screen.getByRole("textbox");

    fireEvent.focus(input);
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("updates value and formats on valid input blur", () => {
    const handleChange = vi.fn();
    render(<ShortDateInput value="" onChange={handleChange} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "15/10/26" } });
    fireEvent.blur(input);

    expect(handleChange).toHaveBeenCalledWith("2026-10-15");
  });

  it("clears value if user inputs invalid date", () => {
    const handleChange = vi.fn();
    render(<ShortDateInput value="2026-09-01" onChange={handleChange} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "invalid" } });
    fireEvent.blur(input);

    expect(handleChange).toHaveBeenCalledWith("");
  });
});
