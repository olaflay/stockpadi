import { drainOutbox, healStrandedStockCountSubmissions, recoverStaleSyncingItems, recoverStuckSyncingItems, refreshActiveAccountContext } from "@/features/sync/drain-outbox";
import { preloadSessionData, type SyncPullTrigger } from "@/features/sync/preload-session-data";
import { setSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import { withSyncLease } from "@/features/sync/sync-lease";
import {
  beginSyncSession,
  recordCoalescedTrigger,
  setCoordinatorPhase,
} from "@/features/sync/sync-observability";
import { startSyncRealtime } from "@/features/sync/sync-realtime";
import { db } from "@/lib/db";
import { getLocalBusinessId } from "@/lib/local-tenant";

// This is a missed-event safety net, not the synchronization transport. It is
// armed only while the app is visible and is cleared as soon as it is hidden.
// The cursor makes this a small request when nothing changed, while two
// minutes limits staleness when Realtime is unavailable on weak networks.
export const ACTIVE_RECONCILIATION_MS = 2 * 60 * 1000;

export interface SyncCycleResult {
  pushResult: Awaited<ReturnType<typeof drainOutbox>>;
  pullResult: Awaited<ReturnType<typeof preloadSessionData>>;
}

let activeCycle: Promise<SyncCycleResult | null> | null = null;
let activeTrigger: SyncPullTrigger | null = null;
let queuedTrigger: SyncPullTrigger | null = null;
let activeCoordinatorStop: (() => void) | null = null;
let activeCoordinatorConsumers = 0;

/** Canonical single-flight sync execution path. */
export function runSyncCycle(trigger: SyncPullTrigger = "startup"): Promise<SyncCycleResult | null> {
  if (activeCycle) {
    // Preserve the existing manual invocation contract: a manual request made
    // during a live cycle runs once after that cycle rather than racing it.
    if (trigger === "manual" && activeTrigger !== "manual") return activeCycle.then(() => runSyncCycle("manual"));
    return activeCycle;
  }

  const cycle = executeSyncCycle(trigger);
  const trackedCycle = cycle.finally(() => {
    if (activeCycle === trackedCycle) {
      activeCycle = null;
      activeTrigger = null;
    }
  });
  activeCycle = trackedCycle;
  activeTrigger = trigger;
  return trackedCycle;
}

function triggerPriority(trigger: SyncPullTrigger): number {
  if (trigger === "manual") return 5;
  if (["local-write", "realtime", "realtime-reconnect", "online", "resume", "focus", "service-worker", "retry"].includes(trigger)) return 4;
  if (trigger === "auth" || trigger === "startup" || trigger === "boot") return 3;
  return 1;
}

function coalesceTrigger(current: SyncPullTrigger | null, next: SyncPullTrigger): SyncPullTrigger {
  if (!current || triggerPriority(next) >= triggerPriority(current)) return next;
  return current;
}

/**
 * Schedules one canonical cycle. A trigger arriving during a cycle is kept as
 * one follow-up trigger; it never starts a second concurrent cursor or outbox
 * operation.
 */
export function triggerSync(trigger: SyncPullTrigger): Promise<SyncCycleResult | null> {
  if (activeCycle) {
    queuedTrigger = coalesceTrigger(queuedTrigger, trigger);
    recordCoalescedTrigger();
    return activeCycle;
  }

  const cycle = runSyncCycle(trigger);
  void cycle.then(() => undefined, () => undefined).finally(() => {
    const next = queuedTrigger;
    queuedTrigger = null;
    if (next) void triggerSync(next).catch(() => undefined);
  });
  return cycle;
}

async function executeSyncCycle(trigger: SyncPullTrigger): Promise<SyncCycleResult | null> {
  return withSyncLease(async () => {
    beginSyncSession(trigger);
    setSyncRuntimePhase("syncing");
    setCoordinatorPhase("syncing");
    try {
      // Only old rows are recovered. A recent syncing row can belong to a
      // live request in another tab and must not be reset mid-flight.
      await recoverStaleSyncingItems();
      await recoverStuckSyncingItems(30000);
      await healStrandedStockCountSubmissions();
      await refreshActiveAccountContext();
      setSyncRuntimePhase("uploading");
      setCoordinatorPhase("uploading");
      const pushResult = await drainOutbox();
      setSyncRuntimePhase("downloading");
      setCoordinatorPhase("downloading");
      const pullResult = await preloadSessionData(
        pushResult.drained > 0 || trigger !== "poll",
        pushResult.drained > 0 ? "push-success" : trigger,
      );
      return { pushResult, pullResult };
    } finally {
      setSyncRuntimePhase("idle");
      setCoordinatorPhase("idle");
    }
  });
}

function clearTimer(timer: number | null): void {
  if (timer !== null) window.clearTimeout(timer);
}

async function nextWakeAt(): Promise<number | null> {
  const businessId = await getLocalBusinessId();
  if (!businessId) return null;
  const outbox = (await db.outbox.toArray()).filter((item) => item.businessId === businessId && ["pending", "blocked"].includes(item.status));
  const state = await db.syncPullState.get(`${businessId}:session`);
  const dates = [
    ...outbox.map((item) => item.nextAttemptAt ? Date.parse(item.nextAttemptAt) : Number.POSITIVE_INFINITY),
    state?.nextPullAttemptAt ? Date.parse(state.nextPullAttemptAt) : Number.POSITIVE_INFINITY,
  ].filter(Number.isFinite);
  return dates.length ? Math.min(...dates) : null;
}

export function startSyncCoordinator(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (activeCoordinatorStop) {
    const existingStop = activeCoordinatorStop;
    activeCoordinatorConsumers += 1;
    return () => {
      if (activeCoordinatorStop !== existingStop) return;
      activeCoordinatorConsumers -= 1;
      if (activeCoordinatorConsumers <= 0) {
        activeCoordinatorStop = null;
        existingStop();
      }
    };
  }

  let stopped = false;
  let wakeTimer: number | null = null;
  let realtimeController: ReturnType<typeof startSyncRealtime> | null = null;

  const scheduleWake = async (): Promise<void> => {
    clearTimer(wakeTimer);
    wakeTimer = null;
    if (stopped || document.visibilityState === "hidden") return;
    const dueAt = await nextWakeAt();
    if (stopped || document.visibilityState !== "visible") return;
    const delay = dueAt === null
      ? ACTIVE_RECONCILIATION_MS
      : Math.max(1000, dueAt - Date.now());
    wakeTimer = window.setTimeout(() => {
      const nextTrigger: SyncPullTrigger = dueAt !== null && dueAt <= Date.now() ? "retry" : "reconciliation";
      requestSync(nextTrigger);
    }, delay);
  };

  const requestSync = (trigger: SyncPullTrigger): void => {
    if (stopped) return;
    const cycle = triggerSync(trigger);
    void cycle.catch(() => undefined).finally(() => {
      realtimeController?.refresh();
      void scheduleWake();
    });
  };

  const onOnline = () => requestSync("online");
  const onFocus = () => requestSync("focus");
  const onPageShow = () => requestSync("resume");
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") requestSync("resume");
    else clearTimer(wakeTimer);
  };
  const onServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type === "stockpadi-sync-request") requestSync("service-worker");
  };

  realtimeController = startSyncRealtime(requestSync);
  requestSync("startup");
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibilityChange);
  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    clearTimer(wakeTimer);
    wakeTimer = null;
    realtimeController?.();
  };
  activeCoordinatorStop = stop;
  activeCoordinatorConsumers = 1;
  return () => {
    if (activeCoordinatorStop !== stop) return;
    activeCoordinatorConsumers -= 1;
    if (activeCoordinatorConsumers <= 0) {
      activeCoordinatorStop = null;
      stop();
    }
  };
}
