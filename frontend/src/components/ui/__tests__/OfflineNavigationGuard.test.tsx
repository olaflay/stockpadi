// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";
import { OfflineNavigationGuard } from "../OfflineNavigationGuard";

describe("OfflineNavigationGuard", () => {
  beforeEach(() => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { ready: new Promise(() => {}) },
    });
  });

  it("keeps an online-only navigation inside the app and shows an accessible dialog", () => {
    render(
      <>
        <Link href="/staff">Staff</Link>
        <OfflineNavigationGuard />
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Staff" }));

    expect(screen.getByRole("dialog", { name: "This page needs a connection" })).toBeInTheDocument();
    expect(screen.getByText(/screen was not saved for offline use yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stay here" })).toBeInTheDocument();
  });

  it("does not abandon the current screen when an offline route has no controlling worker", async () => {
    render(
      <>
        <Link href="/pos">Sell</Link>
        <OfflineNavigationGuard />
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Sell" }));

    await waitFor(() => expect(screen.getByRole("dialog", { name: "This page needs a connection" })).toBeInTheDocument());
    expect(window.location.pathname).not.toBe("/pos");
  });

  it("cancels background route warming as soon as a user chooses a different page", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const request = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(
      () => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("caches", { match: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(window.navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({}), controller: {} },
    });
    try {
      render(
        <>
          <a href="/reports" onClick={(event) => event.preventDefault()}>Open reports</a>
          <OfflineNavigationGuard />
        </>,
      );
      await act(() => vi.advanceTimersByTimeAsync(4_000));
      expect(request).toHaveBeenCalledWith("/dashboard", expect.objectContaining({ priority: "low" }));
      const signal = request.mock.calls[0][1].signal;
      expect(signal?.aborted).toBe(false);
      fireEvent.click(screen.getByRole("link", { name: "Open reports" }));
      expect(signal?.aborted).toBe(true);
    } finally {
      visibility.mockRestore();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
