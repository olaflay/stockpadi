// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    sessionStorage.setItem("stockpadi-cart", JSON.stringify({ "product-1__unit": { quantity: 1 } }));
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
    vi.clearAllMocks();
  });

  it("registers with cache bypass and activates an update without waiting for the cart draft", async () => {
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

    await waitFor(() => expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" }));
    expect(sessionStorage.getItem("stockpadi-cart")).toContain("product-1");
    expect(await db.outbox.get("pwa-update-pending-sale")).toMatchObject({ status: "pending", idempotencyKey: "pwa-update-pending-sale" });
    expect(screen.queryByText(/Finish the current sale/)).not.toBeInTheDocument();
  });
});
