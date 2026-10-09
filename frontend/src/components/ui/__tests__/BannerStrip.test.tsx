// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BannerStrip } from "../BannerStrip";

const state = vi.hoisted(() => ({ online: true, pendingSales: 0, phase: "idle" as "idle" | "uploading" | "downloading" | "syncing" }));

vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => state.online }));
vi.mock("@/lib/use-pending-sync-count", () => ({
  usePendingSyncCount: () => 0,
  usePendingSalesCount: () => state.pendingSales,
}));
vi.mock("@/features/auth/use-current-user", () => ({ useCurrentUserOptional: () => null }));
vi.mock("@/features/sync/sync-runtime-state", () => ({ useSyncRuntimePhase: () => state.phase }));

describe("BannerStrip connection status", () => {
  afterEach(() => {
    cleanup();
    state.online = true;
    state.pendingSales = 0;
    state.phase = "idle";
  });

  it("shows an explicit offline status and waiting sale count", () => {
    state.online = false;
    state.pendingSales = 2;

    render(<BannerStrip />);

    expect(screen.getByText("Offline · 2 sales waiting")).toBeInTheDocument();
  });

  it("shows syncing instead of an unbounded spinner while uploads are active", () => {
    state.phase = "uploading";
    state.pendingSales = 1;

    render(<BannerStrip />);

    expect(screen.getByText("Syncing · 1 sales waiting")).toBeInTheDocument();
  });

  it("shows a settled online state when no sales are waiting", () => {
    render(<BannerStrip />);

    expect(screen.getByText("Online · All sales synced")).toBeInTheDocument();
  });
});
