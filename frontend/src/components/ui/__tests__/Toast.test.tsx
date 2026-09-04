// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/Toast";

function TestConsumer() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast("Product saved successfully", "success")}>
        Show Success Toast
      </button>
      <button onClick={() => showToast("Warning: stock is low", "warning")}>
        Show Warning Toast
      </button>
    </div>
  );
}

describe("Toast notification system", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders a toast and stays visible for 5 seconds before disappearing", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    const triggerBtn = screen.getByText("Show Success Toast");
    act(() => {
      triggerBtn.click();
    });

    expect(screen.getByText("Product saved successfully")).toBeInTheDocument();

    // At 3 seconds (old timeout), it must still be visible
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("Product saved successfully")).toBeInTheDocument();

    // At 5 seconds (new timeout), it dismisses
    act(() => {
      vi.advanceTimersByTime(2001);
    });
    expect(screen.queryByText("Product saved successfully")).not.toBeInTheDocument();
  });

  it("can be cancelled / dismissed immediately using the cancel button", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );

    const triggerBtn = screen.getByText("Show Warning Toast");
    act(() => {
      triggerBtn.click();
    });

    expect(screen.getByText("Warning: stock is low")).toBeInTheDocument();

    // Find the cancel button
    const cancelBtn = screen.getByRole("button", { name: /cancel notification/i });
    expect(cancelBtn).toBeInTheDocument();

    act(() => {
      cancelBtn.click();
    });

    // Toast should be removed immediately without waiting for the timer
    expect(screen.queryByText("Warning: stock is low")).not.toBeInTheDocument();
  });

  it("renders a dedicated action CTA button on the toast card and fires on click", () => {
    const handleAction = vi.fn();

    function ActionConsumer() {
      const { showToast } = useToast();
      return (
        <button
          onClick={() =>
            showToast("Out of stock: Water has 0 on shelf.", "danger", {
              label: "Restock",
              onClick: handleAction,
            })
          }
        >
          Trigger Action Toast
        </button>
      );
    }

    render(
      <ToastProvider>
        <ActionConsumer />
      </ToastProvider>
    );

    act(() => {
      screen.getByText("Trigger Action Toast").click();
    });

    expect(screen.getByText("Out of stock: Water has 0 on shelf.")).toBeInTheDocument();

    const restockBtn = screen.getByRole("button", { name: "Restock" });
    expect(restockBtn).toBeInTheDocument();

    act(() => {
      restockBtn.click();
    });

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Out of stock: Water has 0 on shelf.")).not.toBeInTheDocument();
  });
});
