// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PwaReadiness } from "./PwaReadiness";

describe("PwaReadiness", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not crash when the standalone browser has no service worker API", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });

    expect(() => render(<PwaReadiness />)).not.toThrow();
  });

  it("requests storage persistence even when offline on cold start", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const persistMock = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: { persist: persistMock },
    });

    render(<PwaReadiness />);
    expect(persistMock).toHaveBeenCalledTimes(1);
  });
});
