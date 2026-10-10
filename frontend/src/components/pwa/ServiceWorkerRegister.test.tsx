// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

const state = vi.hoisted(() => ({ pathname: "/business/pos", phase: "idle" as "idle" | "uploading" | "downloading" | "syncing" }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

vi.mock("@/features/sync/sync-runtime-state", () => ({
  useSyncRuntimePhase: () => state.phase,
}));

describe("ServiceWorkerRegister", () => {
  let updateFound: (() => void) | undefined;
  let workerStateChange: (() => void) | undefined;
  const registration = {
    installing: null as { state: string; addEventListener: (type: string, listener: () => void) => void } | null,
    waiting: null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "updatefound") updateFound = listener;
    }),
    removeEventListener: vi.fn(),
  };
  const serviceWorker = {
    controller: {},
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  beforeEach(() => {
    state.pathname = "/business/pos";
    state.phase = "idle";
    updateFound = undefined;
    workerStateChange = undefined;
    registration.installing = null;
    registration.waiting = null;
    sessionStorage.clear();
    sessionStorage.setItem("stockpadi-cart", JSON.stringify({ "product-1__unit": { quantity: 1 } }));
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    vi.clearAllMocks();
  });

  it("registers with cache bypass and waits for an active cart before refreshing", async () => {
    render(<ServiceWorkerRegister />);

    await waitFor(() => expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" }));

    const worker = {
      state: "installed",
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        workerStateChange = listener;
      }),
    };
    registration.installing = worker;
    updateFound?.();
    workerStateChange?.();

    expect(await screen.findByText("Update ready. We'll refresh after this sale is finished.")).toBeInTheDocument();
  });
});
