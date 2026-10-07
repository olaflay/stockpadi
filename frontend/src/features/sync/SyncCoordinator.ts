import { drainOutbox, healStrandedStockCountSubmissions, recoverStaleSyncingItems, recoverStuckSyncingItems, refreshActiveAccountContext } from "@/features/sync/drain-outbox";
import { preloadSessionData, type SyncPullTrigger } from "@/features/sync/preload-session-data";
import { setSyncRuntimePhase } from "@/features/sync/sync-runtime-state";
import { withSyncLease } from "@/features/sync/sync-lease";
import { beginSyncSession, setCoordinatorPhase } from "@/features/sync/sync-observability";
import { getSupabase } from "@/lib/supabase";

const ACTIVE_POLL_MS = 30_000;

export interface SyncCycleResult {
  pushResult: Awaited<ReturnType<typeof drainOutbox>>;
  pullResult: Awaited<ReturnType<typeof preloadSessionData>>;
}

let activeCycle: Promise<SyncCycleResult | null> | null = null;
let activeTrigger: SyncPullTrigger | null = null;
let activeCoordinatorStop: (() => void) | null = null;
let activeCoordinatorConsumers = 0;

/** Canonical single-flight sync entry point for every application trigger. */
export function runSyncCycle(trigger: SyncPullTrigger = "poll"): Promise<SyncCycleResult | null> {
  if (activeCycle) {
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

  let running = false;
  let queuedTrigger: SyncPullTrigger | null = null;
  let stopped = false;
  const requestSync = (trigger: SyncPullTrigger): void => {
    if (stopped) return;
    if (running) {
      queuedTrigger = trigger;
      return;
    }
    running = true;
    void runSyncCycle(trigger).catch(() => undefined).finally(() => {
      running = false;
      if (queuedTrigger) {
        const next = queuedTrigger;
        queuedTrigger = null;
        requestSync(next);
      }
    });
  };

  const onOnline = () => requestSync("online");
  const onFocus = () => requestSync("focus");
  const onPageShow = () => requestSync("focus");
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") requestSync("focus");
  };
  const onServiceWorkerMessage = (event: MessageEvent) => {
    if (event.data?.type === "stockpadi-sync-request") requestSync("online");
  };

  // online is a hint only. The transport verifies actual reachability and
  // records a retryable failure when the radio/captive portal is not ready.
  requestSync("boot");
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVisibilityChange);
  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

  const interval = window.setInterval(() => {
    if (document.visibilityState !== "hidden") requestSync("poll");
  }, ACTIVE_POLL_MS);

  const supabase = getSupabase();
  const authSubscription = supabase?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") return;
    window.setTimeout(() => requestSync("auth"), 0);
  }).data.subscription;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    window.clearInterval(interval);
    authSubscription?.unsubscribe();
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
