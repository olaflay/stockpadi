// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const getLocalBusinessId = vi.hoisted(() => vi.fn().mockResolvedValue("business-a"));
const recordRealtimeHint = vi.hoisted(() => vi.fn());
const recordRealtimeReconnect = vi.hoisted(() => vi.fn());
const recordSkippedPull = vi.hoisted(() => vi.fn());
const syncPullState = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
}));
const session = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ userId: "user-a" }) }));
const localUsers = vi.hoisted(() => ({ get: vi.fn().mockResolvedValue({ accountType: "BUSINESS_OWNER" }) }));
const authStateHandler = vi.hoisted(() => vi.fn());
const unsubscribe = vi.hoisted(() => vi.fn());
const channelOn = vi.hoisted(() => vi.fn());
const channelSubscribe = vi.hoisted(() => vi.fn());
const removeChannel = vi.hoisted(() => vi.fn().mockResolvedValue("ok"));
const getSession = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { session: { access_token: "token" } } }));
const channel = vi.hoisted(() => ({ on: channelOn, subscribe: channelSubscribe }));
const supabase = vi.hoisted(() => ({
  auth: {
    getSession,
    onAuthStateChange: authStateHandler.mockImplementation(() => ({ data: { subscription: { unsubscribe } } })),
  },
  channel: vi.fn(() => channel),
  removeChannel,
}));

vi.mock("@/lib/local-tenant", () => ({ getLocalBusinessId }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => supabase }));
vi.mock("@/lib/db", () => ({
  SESSION_SINGLETON_ID: "current",
  db: { session, localUsers, syncPullState },
}));
vi.mock("@/features/sync/sync-observability", () => ({ recordRealtimeHint, recordRealtimeReconnect, recordSkippedPull }));

import { startSyncRealtime } from "./sync-realtime";

describe("sync realtime wake-up", () => {
  let broadcastHandler: ((message: unknown) => void) | undefined;
  let statusHandler: ((status: string) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    broadcastHandler = undefined;
    statusHandler = undefined;
    syncPullState.get.mockResolvedValue({ id: "business-a:session", lastCompletePullAt: "2026-10-08T10:00:00.000Z" });
    channelOn.mockImplementation((_type: string, _filter: unknown, callback: (message: unknown) => void) => {
      broadcastHandler = callback;
      return channel;
    });
    channelSubscribe.mockImplementation((callback: (status: string) => void) => {
      statusHandler = callback;
      callback("SUBSCRIBED");
      return channel;
    });
  });

  it("treats a valid Broadcast as a cursor-pull trigger, not local data", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(broadcastHandler).toBeDefined());

    broadcastHandler?.({ payload: {
      type: "sync_hint",
      scope: "sync:business:business-a",
      cursor: "2026-10-08T10:01:00.000Z",
    } });
    await vi.waitFor(() => expect(onTrigger).toHaveBeenCalledWith("realtime"));

    expect(syncPullState.update).toHaveBeenCalled();
    stop();
  });

  it("suppresses a stale hint without bypassing the durable cursor", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(broadcastHandler).toBeDefined());

    broadcastHandler?.({ payload: {
      type: "sync_hint",
      scope: "sync:business:business-a",
      cursor: "2026-10-08T09:59:00.000Z",
    } });
    await vi.waitFor(() => expect(recordSkippedPull).toHaveBeenCalledOnce());

    expect(onTrigger).not.toHaveBeenCalledWith("realtime");
    stop();
  });

  it("turns a Realtime reconnect into authoritative reconciliation", async () => {
    const onTrigger = vi.fn();
    const stop = startSyncRealtime(onTrigger);
    await vi.waitFor(() => expect(statusHandler).toBeDefined());

    statusHandler?.("SUBSCRIBED");
    expect(recordRealtimeReconnect).toHaveBeenCalledOnce();
    expect(onTrigger).toHaveBeenCalledWith("realtime-reconnect");
    stop();
  });
});
