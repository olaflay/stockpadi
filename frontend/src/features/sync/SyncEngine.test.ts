import { beforeEach, describe, expect, it, vi } from "vitest";

const recoverStaleSyncingItems = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recoverStuckSyncingItems = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const refreshActiveAccountContext = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const drainOutbox = vi.hoisted(() => vi.fn());
const preloadSessionData = vi.hoisted(() => vi.fn().mockResolvedValue({ fullySynced: true }));

vi.mock("@/features/sync/drain-outbox", () => ({
  drainOutbox,
  recoverStaleSyncingItems,
  recoverStuckSyncingItems,
  refreshActiveAccountContext,
}));
vi.mock("@/features/sync/preload-session-data", () => ({ preloadSessionData }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));

import { runSyncCycle } from "./SyncEngine";

describe("runSyncCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    drainOutbox.mockResolvedValue({ drained: 0, pendingRemaining: 0 });
  });

  it("forces a pull after a successful push", async () => {
    drainOutbox.mockResolvedValueOnce({ drained: 1, pendingRemaining: 0 });

    await runSyncCycle("poll");

    expect(recoverStaleSyncingItems).toHaveBeenCalledBefore(recoverStuckSyncingItems);
    expect(refreshActiveAccountContext).toHaveBeenCalledOnce();
    expect(drainOutbox).toHaveBeenCalledOnce();
    expect(preloadSessionData).toHaveBeenCalledWith(true, "push-success");
  });

  it("forces an immediate pull for reconnect and foreground triggers", async () => {
    drainOutbox.mockResolvedValue({ drained: 0, pendingRemaining: 0 });

    await runSyncCycle("online");
    await runSyncCycle("visibility");

    expect(preloadSessionData).toHaveBeenNthCalledWith(1, true, "online");
    expect(preloadSessionData).toHaveBeenNthCalledWith(2, true, "visibility");
  });
});
