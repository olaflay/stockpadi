// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineOnlyButton } from "../OnlineOnlyButton";

describe("OnlineOnlyButton", () => {
  afterEach(cleanup);

  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
  });

  it("shows the shared Wi-Fi connection dialog and does not run offline", () => {
    const action = vi.fn();
    render(<OnlineOnlyButton onClick={action}>Refund</OnlineOnlyButton>);

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "This action needs a connection" })).toBeInTheDocument();
    expect(screen.getByText(/can't work offline/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("runs the action while online", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    const action = vi.fn();
    render(<OnlineOnlyButton onClick={action}>Refund</OnlineOnlyButton>);

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));

    expect(action).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
