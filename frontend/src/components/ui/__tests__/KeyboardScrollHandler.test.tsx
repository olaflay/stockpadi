// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { KeyboardScrollHandler } from "../KeyboardScrollHandler";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("blurs a focused amount when a touch lands outside text entry", () => {
  render(<><KeyboardScrollHandler /><input aria-label="Amount" type="number" /><p>Summary</p></>);
  const amount = screen.getByLabelText("Amount");
  act(() => amount.focus());
  const tap = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(tap, "pointerType", { value: "touch" });
  fireEvent(screen.getByText("Summary"), tap);
  expect(amount).not.toHaveFocus();
});

it("clears retained focus when the actual visual viewport recovers", () => {
  const viewport = Object.assign(new EventTarget(), { scale: 1, height: window.innerHeight - 240 });
  vi.stubGlobal("visualViewport", viewport);
  render(<><KeyboardScrollHandler /><input aria-label="Amount" type="number" /></>);
  const amount = screen.getByLabelText("Amount");
  act(() => {
    amount.focus();
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(document.documentElement.style.getPropertyValue("--app-visible-height")).toBe(`${viewport.height}px`);
  act(() => {
    viewport.height = window.innerHeight;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(amount).not.toHaveFocus();
  expect(document.documentElement.style.getPropertyValue("--app-visible-height")).toBe("");
});

it("scrolls a focused field above the keyboard when it would be obscured", async () => {
  const viewport = Object.assign(new EventTarget(), { scale: 1, offsetTop: 0, height: 450 });
  vi.stubGlobal("visualViewport", viewport);
  render(<><KeyboardScrollHandler /><input aria-label="Amount" type="number" /></>);
  const amount = screen.getByLabelText("Amount");
  const scroll = vi.fn();
  amount.scrollIntoView = scroll;
  vi.spyOn(amount, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 570, 150, 38));
  act(() => {
    amount.focus();
    viewport.dispatchEvent(new Event("resize"));
  });
  await waitFor(() => expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: "center" })));
});
