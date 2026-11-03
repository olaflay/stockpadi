// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { Modal } from "../Modal";

describe("Modal", () => {
  afterEach(cleanup);

  it("focuses the dialog surface by default without summoning an input keyboard", async () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Add contact">
        <input aria-label="Contact name" />
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Add contact" });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole("textbox", { name: "Contact name" })).not.toHaveFocus();
  });

  it("uses compact modal chrome with a small tonal close icon", () => {
    render(<Modal isOpen onClose={vi.fn()} title="Compact header">Content</Modal>);

    const heading = screen.getByRole("heading", { name: "Compact header" });
    const dialog = screen.getByRole("dialog", { name: "Compact header" });
    const header = heading.parentElement;
    const closeButton = screen.getByRole("button", { name: "Close modal" });
    const tonalIcon = closeButton.firstElementChild;

    expect(header).toHaveClass("min-h-12", "py-1.5");
    expect(closeButton).toHaveClass("bg-transparent", "h-10", "w-10");
    expect(tonalIcon).toHaveClass("h-7", "w-7", "bg-surface-container-high");
    expect(dialog.parentElement).toHaveClass("animate-modal-scrim-in");
    expect(dialog).toHaveClass("animate-sheet-up");
  });

  it("supports explicit first-interactive focus for short action dialogs", async () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Choose an action" initialFocus="first-interactive">
        <button type="button">Continue</button>
      </Modal>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Close modal" })).toHaveFocus());
  });

  it("keeps an initial backward tab inside the dialog", async () => {
    render(<Modal isOpen onClose={vi.fn()} title="Focus trap"><button>Action</button></Modal>);
    const dialog = screen.getByRole("dialog", { name: "Focus trap" });
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Action" })).toHaveFocus();
  });

  it("keeps an input focused when its parent rerenders with a new close callback", async () => {
    function PaymentForm() {
      const [amount, setAmount] = useState("");
      return (
        <Modal isOpen onClose={() => undefined} title="Record payment">
          <input aria-label="Amount received" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Modal>
      );
    }

    render(<PaymentForm />);
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Record payment" })).toHaveFocus());
    const input = screen.getByRole("textbox", { name: "Amount received" });
    input.focus();
    fireEvent.change(input, { target: { value: "6" } });

    await new Promise((resolve) => window.setTimeout(resolve, 80));
    expect(input).toHaveFocus();
    expect(input).toHaveValue("6");
  });

  it("closes with Escape and restores focus to its trigger", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <Modal isOpen onClose={onClose} title="Details">Content</Modal>,
    );
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Details" })).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<Modal isOpen={false} onClose={onClose} title="Details">Content</Modal>);
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it("tracks the sheet with the pointer while keeping the handle width fixed", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Drag test">Content</Modal>);
    const dialog = screen.getByRole("dialog", { name: "Drag test" });
    const handle = document.querySelector("[data-sheet-drag-handle]") as HTMLElement;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      width: 360, height: 400, top: 300, right: 360, bottom: 700, left: 0, x: 0, y: 300, toJSON: () => ({}),
    });

    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }));
    fireEvent(handle, new MouseEvent("pointermove", { bubbles: true, clientY: 220 }));

    await waitFor(() => expect(dialog.style.transform).toBe("translate3d(0, 120px, 0)"));
    expect(handle.firstElementChild).toHaveClass("w-8");
    expect((handle.firstElementChild as HTMLElement).style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });
});
