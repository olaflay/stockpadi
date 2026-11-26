// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";
import { db } from "@/lib/db";

const state = vi.hoisted(() => ({ phase: "idle" as "idle" | "uploading" | "downloading" | "syncing" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/sync/sync-runtime-state", () => ({
  useSyncRuntimePhase: () => state.phase,
}));

describe("ServiceWorkerRegister", () => {
  let updateFound: (() => void) | undefined;
  let workerStateChange: (() => void) | undefined;
  const registration = {
    active: { postMessage: vi.fn() } as { postMessage: (message: unknown) => void } | null,
    installing: null as { state: string; addEventListener: (type: string, listener: () => void) => void } | null,
    waiting: null as { postMessage: (message: unknown) => void } | null,
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
    state.phase = "idle";
    updateFound = undefined;
    workerStateChange = undefined;
    registration.installing = null;
    registration.waiting = null;
    registration.active = { postMessage: vi.fn() };
    Object.defineProperty(serviceWorker, "controller", { configurable: true, value: {} });
    sessionStorage.setItem("stockpadi-cart", JSON.stringify({ "product-1__unit": { quantity: 1 } }));
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });

  it("warms only the minimum selling shell after startup settles", async () => {
    vi.useFakeTimers();
    Object.defineProperty(serviceWorker, "controller", { configurable: true, value: null });
    render(<ServiceWorkerRegister />);

    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalled());
    expect(registration.active?.postMessage).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(registration.active?.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "CACHE_OFFLINE_ROUTES",
      routes: ["/dashboard", "/pos"],
    }));
    vi.useRealTimers();
  });

  it("waits for a first-install worker to become active before marking the shell warm", async () => {
    vi.useFakeTimers();
    registration.active = null;
    render(<ServiceWorkerRegister />);

    await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(2_500);
    const activeWorker = { postMessage: vi.fn() };
    registration.active = activeWorker;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(activeWorker.postMessage).toHaveBeenCalledWith({
      type: "CACHE_OFFLINE_ROUTES",
      routes: ["/dashboard", "/pos"],
    });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps an installed update waiting until the operator chooses to activate it", async () => {
    await db.outbox.put({
      clientId: "pwa-update-pending-sale",
      mutationId: "pwa-update-pending-sale",
      idempotencyKey: "pwa-update-pending-sale",
      payloadVersion: 1,
      type: "sale",
      payload: { id: "pwa-update-pending-sale" },
      createdAtLocal: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
      lastError: null,
    });
    render(<ServiceWorkerRegister />);

    await waitFor(() => expect(serviceWorker.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" }));

    const worker = {
      state: "installed",
      postMessage: vi.fn(),
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        workerStateChange = listener;
      }),
    };
    registration.installing = worker;
    registration.waiting = worker;
    updateFound?.();
    workerStateChange?.();

    expect(worker.postMessage).not.toHaveBeenCalled();
    state.phase = "syncing";
    fireEvent.click(await screen.findByRole("button", { name: "Update now" }));
    await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" }));
    expect(sessionStorage.getItem("stockpadi-cart")).toContain("product-1");
    expect(await db.outbox.get("pwa-update-pending-sale")).toMatchObject({ status: "pending", idempotencyKey: "pwa-update-pending-sale" });
    expect(screen.queryByText(/Finish the current sale/)).not.toBeInTheDocument();
  });
});
