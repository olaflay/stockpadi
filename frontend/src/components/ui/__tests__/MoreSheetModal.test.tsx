// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoreSheetModal } from "../MoreSheetModal";
import type { CurrentUser } from "@/features/auth/use-current-user";

let currentUser: CurrentUser = {
  id: "owner-user",
  fullName: "Owner",
  accountType: "BUSINESS_OWNER",
};

vi.mock("@/features/auth/use-current-user", () => ({
  useCurrentUser: () => currentUser,
  hasAccountType: (user: CurrentUser, accountTypes: readonly string[]) =>
    Boolean(user.accountType && accountTypes.includes(user.accountType)),
}));

describe("MoreSheetModal navigation", () => {
  beforeEach(() => {
    currentUser = {
      id: "owner-user",
      fullName: "Owner",
      accountType: "BUSINESS_OWNER",
    };
  });

  afterEach(() => cleanup());

  it("does not repeat owner destinations already shown in the bottom navigation", () => {
    render(<MoreSheetModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "More navigation menu" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Reports" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Products" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/sales");
  });

  it("does not repeat the worker stock-count destination and sits at the safe bottom edge", () => {
    currentUser = {
      id: "worker-user",
      fullName: "Worker",
      accountType: "WORKER",
      permissions: ["SUBMIT_STOCK_COUNT", "VIEW_OWN_SALES"],
    };

    const { container } = render(<MoreSheetModal isOpen onClose={vi.fn()} />);
    const modalContainer = container.querySelector("[data-modal-container]") as HTMLElement;

    expect(screen.queryByRole("link", { name: "Stock Count" })).toBeNull();
    expect(screen.getByRole("link", { name: "Sales" })).toHaveAttribute("href", "/sales");
    expect(modalContainer.className).toContain("pb-[env(safe-area-inset-bottom,0px)]");
  });

  it("dismisses after the drag passes roughly halfway down the sheet", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(<MoreSheetModal isOpen onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "More navigation menu" });
    const handle = container.querySelector("[data-sheet-drag-handle]") as HTMLElement;
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      width: 360, height: 400, top: 300, right: 360, bottom: 700, left: 0, x: 0, y: 300, toJSON: () => ({}),
    });

    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }));
    fireEvent(handle, new MouseEvent("pointermove", { bubbles: true, clientY: 290 }));
    fireEvent(handle, new MouseEvent("pointerup", { bubbles: true, clientY: 290 }));
    vi.advanceTimersByTime(200);

    expect(onClose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("snaps back instead of dismissing when the pointer is cancelled", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    const onClose = vi.fn();
    const { container } = render(<MoreSheetModal isOpen onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "More navigation menu" });
    const handle = container.querySelector("[data-sheet-drag-handle]") as HTMLElement;

    fireEvent(handle, new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }));
    fireEvent(handle, new MouseEvent("pointermove", { bubbles: true, clientY: 400 }));
    fireEvent(handle, new MouseEvent("pointercancel", { bubbles: true, clientY: 400 }));

    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.style.transform).toBe("translate3d(0, 0, 0)");
  });

  it("moves focus into the modal sheet and restores the trigger", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(<MoreSheetModal isOpen onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "More navigation menu" });

    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus();
    rerender(<MoreSheetModal isOpen={false} onClose={vi.fn()} />);
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });
});
