// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const recoverStaleSyncingItems = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recoverStuckSyncingItems = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const healStrandedStockCountSubmissions = vi.hoisted(() => vi.fn().mockResolvedValue(0));
const refreshActiveAccountContext = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const drainOutbox = vi.hoisted(() => vi.fn());
const preloadSessionData = vi.hoisted(() => vi.fn().mockResolvedValue({ fullySynced: true }));

vi.mock("@/features/sync/drain-outbox", () => ({
  drainOutbox,
  healStrandedStockCountSubmissions,
  recoverStaleSyncingItems,
  recoverStuckSyncingItems,
  refreshActiveAccountContext,
}));
vi.mock("@/features/sync/preload-session-data", () => ({ preloadSessionData }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));

import { ACTIVE_RECONCILIATION_MS, runSyncCycle, triggerSync } from "./SyncCoordinator";

describe("runSyncCycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    drainOutbox.mockResolvedValue({ drained: 0, pendingRemaining: 0 });
  });

  it("forces a pull after a successful push", async () => {
    drainOutbox.mockResolvedValueOnce({ drained: 1, pendingRemaining: 0 });

    await runSyncCycle("poll");

    expect(recoverStaleSyncingItems).toHaveBeenCalledBefore(recoverStuckSyncingItems);
    // Stranded stock counts must be made retryable before the push, otherwise
    // the drain cannot retire them until the following cycle.
    expect(healStrandedStockCountSubmissions).toHaveBeenCalledBefore(drainOutbox);
    expect(refreshActiveAccountContext).not.toHaveBeenCalled();
    expect(drainOutbox).toHaveBeenCalledOnce();
    expect(preloadSessionData).toHaveBeenCalledWith(true, "push-success");
  });

  it("forces an immediate pull for reconnects", async () => {
    drainOutbox.mockResolvedValue({ drained: 0, pendingRemaining: 0 });

    await runSyncCycle("online");

    expect(preloadSessionData).toHaveBeenNthCalledWith(1, true, "online");
  });

  it("forces an incremental pull when an active app returns to the foreground", async () => {
    await runSyncCycle("focus");

    expect(preloadSessionData).toHaveBeenCalledWith(true, "focus");
  });

  it("refreshes account context only for lifecycle events", async () => {
    await runSyncCycle("startup");
    await runSyncCycle("online");
    await runSyncCycle("resume");

    expect(refreshActiveAccountContext).toHaveBeenCalledTimes(3);
  });

  it("coalesces concurrent lifecycle triggers into one follow-up account refresh", async () => {
    let releasePush!: (value: { drained: number; pendingRemaining: number }) => void;
    drainOutbox.mockImplementationOnce(() => new Promise((resolve) => { releasePush = resolve; }));

    const startup = triggerSync("startup");
    await vi.waitFor(() => expect(drainOutbox).toHaveBeenCalledOnce());
    triggerSync("online");
    triggerSync("focus");

    releasePush({ drained: 0, pendingRemaining: 0 });
    await startup;
    await vi.waitFor(() => expect(drainOutbox).toHaveBeenCalledTimes(2));

    expect(refreshActiveAccountContext).toHaveBeenCalledTimes(2);
  });

  it("pushes a completed sale through the fast lane without maintenance or account refresh", async () => {
    drainOutbox.mockResolvedValueOnce({ drained: 1, pendingRemaining: 0 });

    const result = await runSyncCycle("sale");

    expect(refreshActiveAccountContext).not.toHaveBeenCalled();
    expect(recoverStaleSyncingItems).not.toHaveBeenCalled();
    expect(healStrandedStockCountSubmissions).not.toHaveBeenCalled();
    expect(drainOutbox).toHaveBeenCalledWith({ types: ["sale"], runMaintenance: false });
    expect(preloadSessionData).not.toHaveBeenCalled();
    expect(result?.pullResult.fullySynced).toBe(false);
  });

  it("does not wait for an unrelated routine pull before sending a sale", async () => {
    let releasePull!: (value: { fullySynced: boolean }) => void;
    preloadSessionData.mockImplementationOnce(() => new Promise((resolve) => { releasePull = resolve; }));

    const routine = triggerSync("startup");
    await vi.waitFor(() => expect(preloadSessionData).toHaveBeenCalledOnce());

    const sale = triggerSync("sale");
    await vi.waitFor(() => expect(drainOutbox).toHaveBeenCalledTimes(2));
    expect(drainOutbox).toHaveBeenNthCalledWith(2, { types: ["sale"], runMaintenance: false });

    releasePull({ fullySynced: true });
    await Promise.all([routine, sale]);
  });

  it("uses the complete worker-safe cycle for a manual sync", async () => {
    drainOutbox.mockResolvedValue({ drained: 2, pendingRemaining: 0 });

    const result = await runSyncCycle("manual");

    expect(refreshActiveAccountContext).not.toHaveBeenCalled();
    expect(drainOutbox).toHaveBeenCalledOnce();
    expect(preloadSessionData).toHaveBeenCalledWith(true, "push-success");
    expect(result).toEqual({
      pushResult: { drained: 2, pendingRemaining: 0 },
      pullResult: { fullySynced: true },
    });
  });

  it("serializes a manual sync behind an automatic cycle instead of racing the pull cursor", async () => {
    let releasePush!: (value: { drained: number; pendingRemaining: number }) => void;
    drainOutbox.mockImplementationOnce(() => new Promise((resolve) => { releasePush = resolve; }));

    const automatic = runSyncCycle("poll");
    const manual = runSyncCycle("manual");

    await vi.waitFor(() => expect(drainOutbox).toHaveBeenCalledOnce());

    releasePush({ drained: 0, pendingRemaining: 0 });
    await Promise.all([automatic, manual]);

    expect(drainOutbox).toHaveBeenCalledTimes(2);
    expect(preloadSessionData).toHaveBeenNthCalledWith(1, false, "poll");
    expect(preloadSessionData).toHaveBeenNthCalledWith(2, true, "manual");
  });

  it("coalesces a trigger that arrives during a live cycle into one follow-up", async () => {
    let releasePush!: (value: { drained: number; pendingRemaining: number }) => void;
    drainOutbox.mockImplementationOnce(() => new Promise((resolve) => { releasePush = resolve; }));

    const first = triggerSync("startup");
    await vi.waitFor(() => expect(drainOutbox).toHaveBeenCalledOnce());
    triggerSync("realtime");

    releasePush({ drained: 0, pendingRemaining: 0 });
    await first;
    await vi.waitFor(() => expect(drainOutbox).toHaveBeenCalledTimes(2));

    expect(preloadSessionData).toHaveBeenCalledWith(true, "realtime");
  });

  it("keeps reconciliation low-frequency", () => {
    expect(ACTIVE_RECONCILIATION_MS).toBe(2 * 60 * 1000);
  });
});
