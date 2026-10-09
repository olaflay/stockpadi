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
});
