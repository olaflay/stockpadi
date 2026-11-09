// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BannerStrip } from "../BannerStrip";

const state = vi.hoisted(() => ({ online: true, pendingSales: 0, failed: 0, phase: "idle" as "idle" | "uploading" | "downloading" | "syncing" }));

vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => state.online }));
vi.mock("@/lib/use-pending-sync-count", () => ({
  usePendingSalesCount: () => state.pendingSales,
  useFailedSyncCount: () => state.failed,
}));
vi.mock("@/features/auth/use-current-user", () => ({ useCurrentUserOptional: () => null }));
vi.mock("@/features/sync/sync-runtime-state", () => ({ useSyncRuntimePhase: () => state.phase }));

describe("BannerStrip connection status", () => {
  afterEach(() => {
    cleanup();
    state.online = true;
    state.pendingSales = 0;
    state.failed = 0;
    state.phase = "idle";
  });

  it("shows a concise offline status", () => {
    state.online = false;

    render(<BannerStrip />);

    expect(screen.getByText("Offline · Sales stay on this phone")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status-dot")).toHaveClass("bg-danger");
  });

  it("shows green online status when settled", () => {
    render(<BannerStrip />);
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status-dot")).toHaveClass("bg-success");
  });

  it("shows yellow while saving", () => {
    state.phase = "uploading";
    render(<BannerStrip />);
    expect(screen.getByText("Saving")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status-dot")).toHaveClass("bg-warning");
  });
});
