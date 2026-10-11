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
    state.pendingSales = 2;

    render(<BannerStrip />);

    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("uses plain saving language while a sale is being sent", () => {
    state.phase = "uploading";
    state.pendingSales = 1;

    render(<BannerStrip />);

    expect(screen.getByText("Saving")).toBeInTheDocument();
  });

  it("shows a settled online state when no sales are waiting", () => {
    render(<BannerStrip />);

    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows only the actionable error label when a mutation needs attention", () => {
    state.failed = 1;

    render(<BannerStrip />);

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });
});
