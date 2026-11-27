// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BannerStrip } from "../BannerStrip";

const state = vi.hoisted(() => ({
  online: true, pending: 0, failed: 0, required: false, alerts: 0,
  pull: null as { lastUpdated?: string; failed: boolean } | null,
  phase: "idle" as "idle" | "uploading" | "downloading" | "syncing",
}));

vi.mock("@/lib/use-online-status", () => ({ useOnlineStatus: () => state.online }));
vi.mock("@/lib/use-pending-sync-count", () => ({
  usePendingSyncCount: () => state.pending,
  useFailedSyncCount: () => state.failed,
}));
vi.mock("@/features/auth/use-current-user", () => ({ useCurrentUserOptional: () => null }));
vi.mock("@/features/sync/sync-runtime-state", () => ({ useSyncRuntimePhase: () => state.phase }));
vi.mock("@/lib/use-sync-safety", () => ({ useSyncSafety: () => ({ required: state.required }) }));
vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => state.pull }));
vi.mock("@/features/alerts/use-alert-center", () => ({ useAlertBadgeCount: () => state.alerts }));

describe("BannerStrip connection status", () => {
  afterEach(() => {
    cleanup();
    state.online = true;
    state.pending = 0;
    state.failed = 0;
    state.phase = "idle";
    state.pull = null;
    state.required = false;
    state.alerts = 0;
  });

  it("shows a concise offline status", () => {
    state.online = false;

    render(<BannerStrip />);

    expect(screen.getByText("Offline · Sales stay on this device")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status-dot")).toHaveClass("bg-on-surface-muted");
  });

  it("waits for confirmation before showing all saved", () => {
    render(<BannerStrip />);
    expect(screen.getByText("Online · Waiting for confirmation")).toBeInTheDocument();
  });

  it("shows green only for a completed update", () => {
    state.pull = { lastUpdated: "2026-11-26T12:00:00Z", failed: false };
    render(<BannerStrip />);
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status-dot")).toHaveClass("bg-success");
  });

  it("shows yellow while saving", () => {
    state.phase = "uploading";
    render(<BannerStrip />);
    expect(screen.getByText("Saving changes…")).toBeInTheDocument();
    expect(screen.getByTestId("connection-status-dot")).toHaveClass("bg-warning");
  });

  it("shows pending uploads and gives failed changes priority, even offline", () => {
    state.pending = 2;
    const { rerender } = render(<BannerStrip />);
    expect(screen.getByText("Changes waiting to upload")).toBeInTheDocument();
    state.online = false;
    state.failed = 1;
    rerender(<BannerStrip />);
    expect(screen.getByText("Offline · Changes need review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/settings/sync-health");
  });

  it("shows a single notification link alongside connection status and updates its count", () => {
    const { rerender } = render(<BannerStrip />);
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("href", "/alerts");
    state.alerts = 7;
    rerender(<BannerStrip />);
    const link = screen.getByRole("link", { name: "Notifications, 7 unread" });
    expect(link).toHaveTextContent("7");
    expect(link.parentElement).toContainElement(screen.getByRole("status"));
    expect(screen.getAllByRole("link", { name: /Notifications/ })).toHaveLength(1);
  });
});
